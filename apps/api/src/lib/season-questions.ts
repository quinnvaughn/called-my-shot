import {
	autoResolutionSource,
	generateQuestionTitle,
	resolutionModeFor,
} from "@called-my-shot/schemas"
import { defaultLossRate } from "@called-my-shot/scoring"
import { inArray, sql } from "drizzle-orm"
import { match } from "ts-pattern"
import { db } from "../db"
import { LEAGUE_SEASON_FORMAT } from "../db/catalog/league-season-format"
import type { RecurringQuestionTemplate } from "../db/catalog/recurring-question-catalog"
import {
	ballots,
	type Player,
	questionOptions,
	type questions,
} from "../db/schema"
import { buildPlayerPool, buildTeamPool } from "./award-pool"
import { generateUniqueBallotSlug } from "./ballot-slug"
import { titleLossRateFor } from "./game-questions/title-settings"
import { numericToleranceFor } from "./numeric-tolerance"
import { attachToBallot } from "./questions/ballot"
import {
	insertQuestion,
	listOrNull,
	type OptionRow,
	playerOptions,
	type QuestionBase,
	type QuestionShapeFields,
	teamOptions,
} from "./questions/insert"
import { getCurrentSeason } from "./seasons"
import { compareTeamsByGrouping, teamSectionResolver } from "./team-grouping"

// Published immediately, not left in draft - these are auto-generated from
// the catalog, not a hand-built set an admin needs to review before it goes
// live, so there's no "not happy with the member set yet" step to wait on
// the way there is for a manually-built ballot (see ballotStatus's own doc
// comment in db/schema/ballots.ts). Also flips an already-existing ballot
// from draft to published if it's somehow still draft (e.g. left over from
// before this behavior existed), so a rerun heals that too.
//
// sortOrder applies on insert only - an existing ballot keeps whatever
// position it has, including one an admin set by hand in the ballot list.
// So the catalog seeds each new season's order and every later sync leaves
// it alone; editing the catalog's group order only moves ballots that
// haven't been created yet.
async function findOrCreateBallot(params: {
	leagueId: string
	leagueSlug: string
	sportId: string
	seasonId: string
	seasonDisplayName: string
	name: string
	sortOrder: number
	createdBy: string
}): Promise<typeof ballots.$inferSelect> {
	const existing = await db.query.ballots.findFirst({
		where: {
			leagueId: params.leagueId,
			seasonId: params.seasonId,
			name: params.name,
		},
	})
	if (existing) {
		if (existing.status === "published") return existing
		const [republished] = await db
			.update(ballots)
			.set({ status: "published", publishedAt: new Date() })
			.where(sql`${ballots.id} = ${existing.id}`)
			.returning()
		return republished ?? existing
	}
	const [inserted] = await db
		.insert(ballots)
		.values({
			name: params.name,
			slug: await generateUniqueBallotSlug({
				leagueSlug: params.leagueSlug,
				seasonDisplayName: params.seasonDisplayName,
				name: params.name,
			}),
			sportId: params.sportId,
			leagueId: params.leagueId,
			seasonId: params.seasonId,
			createdBy: params.createdBy,
			sortOrder: params.sortOrder,
			status: "published",
			publishedAt: new Date(),
		})
		.returning()
	if (!inserted) {
		throw new Error(
			`findOrCreateBallot: insert returned nothing for "${params.name}"`,
		)
	}
	return inserted
}

// Order-independent set equality, treating null/undefined/empty as the same
// "no filter" value - matches how the rest of this codebase already reads
// awardConferences (an empty array and a null column both mean "whole
// league," see e.g. createQuestion's awardConferences?.length checks).
function sameFilterSet(a?: string[] | null, b?: string[] | null): boolean {
	const setA = new Set(a ?? [])
	const setB = new Set(b ?? [])
	if (setA.size !== setB.size) return false
	for (const value of setA) if (!setB.has(value)) return false
	return true
}

// What every generator shares about the league, season and ballot it's
// filling.
type GenerationContext = {
	leagueId: string
	leagueSlug: string
	sportId: string
	seasonId: string
	seasonYear: number
	resolutionSource: string
	createdBy: string
	ballotId: string
}

// Inserts one official question with its options and appends it to the
// context's ballot, all in one transaction.
async function createOnBallot(
	ctx: GenerationContext,
	question: Pick<
		QuestionBase,
		| "shape"
		| "title"
		| "locksAt"
		| "lossRate"
		| "resolutionSource"
		| "resolutionMode"
	>,
	shapeFields: QuestionShapeFields,
	options: OptionRow[],
	member: { label: string; slot?: string | null; section?: string | null },
): Promise<void> {
	await db.transaction(async (tx) => {
		const created = await insertQuestion(
			tx,
			{
				...question,
				creatorId: ctx.createdBy,
				isOfficial: true,
				sportId: ctx.sportId,
				leagueId: ctx.leagueId,
				seasonId: ctx.seasonId,
			},
			shapeFields,
			options,
		)
		await attachToBallot(tx, {
			ballotId: ctx.ballotId,
			questionId: created.id,
			...member,
		})
	})
}

type AwardTemplate = Extract<
	RecurringQuestionTemplate,
	{ shape: "player_season_award" | "team_season_award" }
>

// awardName alone isn't a unique key - MLB's "MVP" catalog entries share it
// across two real awards (AL MVP, NL MVP), distinguished only by
// awardConferences, so a candidate only counts as "already generated" if its
// conference/division scope matches too.
async function findExistingAward(
	ctx: GenerationContext,
	template: AwardTemplate,
) {
	const candidates = await db.query.questions.findMany({
		where: {
			leagueId: ctx.leagueId,
			seasonId: ctx.seasonId,
			shape: template.shape,
			awardName: template.awardName,
		},
	})
	return candidates.find(
		(q) =>
			sameFilterSet(q.awardConferences, template.awardConferences) &&
			sameFilterSet(q.awardDivisions, template.awardDivisions),
	)
}

// The columns and ballot member both award shapes fill the same way.
function awardQuestion(template: AwardTemplate) {
	return {
		title: generateQuestionTitle({
			shape: template.shape,
			awardName: template.awardName,
			verb: template.awardVerb,
			picksRequired: template.picksRequired,
			awardConferences: template.awardConferences,
			awardDivisions: template.awardDivisions,
		}),
		shapeFields: {
			picksRequired: template.picksRequired,
			awardName: template.awardName,
			awardVerb: template.awardVerb,
			awardConferences: listOrNull(template.awardConferences),
			awardDivisions: listOrNull(template.awardDivisions),
		},
		member: {
			label: template.label ?? template.awardName,
			slot: template.slot,
			section: template.ballotSection,
		},
	}
}

// Fans out one team_season_stat_numeric_guess question per team in the
// league - the win-totals use case (statName "Wins"), also reusable for any
// other season-long team numeric guess a future template adds (e.g. net
// rating). Skips teams that already have a question for this
// (leagueId, seasonId, shape, subjectTeamId) - reruns are idempotent per team,
// not just per template, so a mid-season catalog addition to an
// already-generated league only creates what's missing. Whether the season
// has already started (win totals stop being a real guess once it has) is
// decided by the caller, before this even runs - see generateSeasonQuestions.
async function generatePerTeamNumericGuess(
	ctx: GenerationContext,
	template: Extract<
		RecurringQuestionTemplate,
		{ shape: "team_season_stat_numeric_guess" }
	>,
	locksAt: Date,
): Promise<{ created: number; skipped: number }> {
	// Win totals settle from ESPN's standings, so they store ESPN as their
	// source in place of the one passed in.
	const resolutionMode = resolutionModeFor({
		shape: "team_season_stat_numeric_guess",
		leagueSlug: ctx.leagueSlug,
		statName: template.statName,
		statAggregation: "total",
	})
	const resolutionSource =
		resolutionMode === "system"
			? autoResolutionSource("season")
			: ctx.resolutionSource
	// Sorted here rather than in the query so the ballot's own order comes
	// from the same comparator the section headings do (see team-grouping.ts)
	// - attachToBallot appends at max(sortOrder)+1, so iteration order IS the
	// rendered order, and a league's divisions come out as contiguous runs.
	const teamsInLeague = (
		await db.query.teams.findMany({ where: { leagueId: ctx.leagueId } })
	).sort(compareTeamsByGrouping)
	// Resolved against the whole league at once - whether a division name
	// needs its conference spelled out in front of it is a league-level
	// question (see teamSectionResolver).
	const sectionFor = teamSectionResolver(teamsInLeague)
	const stat = await db.query.stats.findFirst({
		where: { sportId: ctx.sportId, name: template.statName },
		with: { toleranceTier: true, teamToleranceTier: true },
	})
	const tolerance = stat
		? numericToleranceFor("team_season_stat_numeric_guess", stat)
		: null
	if (!stat || !tolerance) {
		throw new Error(
			`generatePerTeamNumericGuess: stat "${template.statName}" not found or missing a tolerance tier for sport ${ctx.sportId}`,
		)
	}
	const { numericTolerancePct, numericToleranceAbsolute } = tolerance

	let created = 0
	let skipped = 0
	for (const team of teamsInLeague) {
		const existing = await db.query.questions.findFirst({
			where: {
				leagueId: ctx.leagueId,
				seasonId: ctx.seasonId,
				shape: "team_season_stat_numeric_guess",
				subjectTeamId: team.id,
			},
		})
		if (existing) {
			skipped++
			continue
		}

		await createOnBallot(
			ctx,
			{
				shape: "team_season_stat_numeric_guess",
				title: generateQuestionTitle({
					shape: "team_season_stat_numeric_guess",
					teamName: team.name,
					statName: template.statName,
					year: ctx.seasonYear,
				}),
				resolutionMode,
				resolutionSource,
				locksAt,
				lossRate: defaultLossRate("team_season_stat_numeric_guess", {}),
			},
			{
				statId: stat.id,
				statAggregation: "total",
				subjectTeamId: team.id,
				numericTolerancePct,
				numericToleranceAbsolute,
			},
			[],
			// Same slot/label convention as every award ballot member: slot is
			// the short bold badge ("LAL"), label is the full spelled-out text
			// underneath it ("Los Angeles Lakers") - not the other way around.
			{ label: team.name, slot: team.abbreviation, section: sectionFor(team) },
		)
		created++
	}
	return { created, skipped }
}

// An award question's options are a snapshot of the pool at the moment it was
// generated, but the pool it came from keeps moving all season: a player is
// called up in August, a rookie's eligibility is corrected by a later sync,
// somebody changes organizations. Left alone, the first sync of the season
// decides who can ever win the award - the September call-up who actually
// wins Rookie of the Year is simply not on the ballot.
//
// So every rerun re-derives the pool and reconciles:
//   - a pool player with no option gets one, appended after the existing
//     order so nobody's list reshuffles under them mid-season;
//   - an option whose player has left the pool is dropped only if nobody has
//     called it - a pick already made outranks a pool that has since moved,
//     since deleting the option deletes the call selection with it.
// Only while the question is still open: a locked or resolved question's
// option set is part of what was already scored against.
export async function reconcileAwardOptions(
	question: typeof questions.$inferSelect,
	pool: Player[],
): Promise<void> {
	if (question.status !== "open") return

	const options = await db.query.questionOptions.findMany({
		where: { questionId: question.id },
	})
	const optionByPlayerId = new Map(
		options.flatMap((o) => (o.playerId ? [[o.playerId, o] as const] : [])),
	)
	const poolPlayerIds = new Set(pool.map((p) => p.id))

	const missing = pool.filter((p) => !optionByPlayerId.has(p.id))
	const stale = options.filter(
		(o) => o.playerId && !poolPlayerIds.has(o.playerId),
	)
	if (missing.length === 0 && stale.length === 0) return

	const calledOptionIds = new Set(
		stale.length === 0
			? []
			: (
					await db.query.callSelections.findMany({
						where: { optionId: { in: stale.map((o) => o.id) } },
					})
				).map((s) => s.optionId),
	)
	const removable = stale.filter((o) => !calledOptionIds.has(o.id))

	await db.transaction(async (tx) => {
		if (removable.length > 0) {
			await tx.delete(questionOptions).where(
				inArray(
					questionOptions.id,
					removable.map((o) => o.id),
				),
			)
		}
		if (missing.length > 0) {
			const nextSortOrder = Math.max(-1, ...options.map((o) => o.sortOrder)) + 1
			await tx.insert(questionOptions).values(
				playerOptions(missing).map((option, index) => ({
					...option,
					questionId: question.id,
					sortOrder: nextSortOrder + index,
				})),
			)
		}
	})
	console.log(
		`[season-questions] "${question.title}": +${missing.length} option(s), -${removable.length} (${stale.length - removable.length} kept, already called)`,
	)
}

async function generatePlayerSeasonAward(
	ctx: GenerationContext,
	template: Extract<
		RecurringQuestionTemplate,
		{ shape: "player_season_award" }
	>,
	locksAt: Date,
): Promise<{ created: number; skipped: number }> {
	const existing = await findExistingAward(ctx, template)
	const pool = await buildPlayerPool(
		{ leagueId: ctx.leagueId },
		{
			conferences: template.awardConferences,
			divisions: template.awardDivisions,
			positions: template.awardPositions,
			seasonsInLeague: template.awardSeasonsInLeague,
			rookieOnly: template.awardRookieOnly,
		},
	)

	if (existing) {
		await reconcileAwardOptions(existing, pool)
		return { created: 0, skipped: 1 }
	}

	if (pool.length < template.picksRequired) {
		throw new Error(
			`generatePlayerSeasonAward: not enough players for "${template.awardName}" (need ${template.picksRequired}, found ${pool.length})`,
		)
	}

	const { title, shapeFields, member } = awardQuestion(template)
	await createOnBallot(
		ctx,
		{
			shape: "player_season_award",
			title,
			resolutionSource: ctx.resolutionSource,
			locksAt,
			lossRate: defaultLossRate("player_season_award", {
				picksRequired: template.picksRequired,
			}),
		},
		{
			...shapeFields,
			awardPositions: listOrNull(template.awardPositions),
			awardSeasonsInLeague: listOrNull(template.awardSeasonsInLeague),
			awardRookieOnly: template.awardRookieOnly ?? null,
		},
		playerOptions(pool),
		member,
	)
	return { created: 1, skipped: 0 }
}

async function generateTeamSeasonAward(
	ctx: GenerationContext,
	template: Extract<RecurringQuestionTemplate, { shape: "team_season_award" }>,
	locksAt: Date,
): Promise<{ created: number; skipped: number }> {
	// A championship settles from ESPN's postseason results, so it stores ESPN
	// as its source in place of the one passed in.
	const resolutionMode = resolutionModeFor({
		shape: "team_season_award",
		leagueSlug: ctx.leagueSlug,
		statName: null,
		awardName: template.awardName,
		awardVerb: template.awardVerb,
		picksRequired: template.picksRequired,
		awardConferences: template.awardConferences,
		awardDivisions: template.awardDivisions,
	})
	if (await findExistingAward(ctx, template)) return { created: 0, skipped: 1 }

	const pool = await buildTeamPool(
		{ leagueId: ctx.leagueId },
		{
			conferences: template.awardConferences,
			divisions: template.awardDivisions,
		},
	)
	if (pool.length < template.picksRequired) {
		throw new Error(
			`generateTeamSeasonAward: not enough teams for "${template.awardName}" (need ${template.picksRequired}, found ${pool.length})`,
		)
	}

	const lossRate =
		(template.picksRequired === 1
			? await titleLossRateFor(ctx.leagueId, template.awardName)
			: null) ??
		defaultLossRate("team_season_award", {
			picksRequired: template.picksRequired,
		})

	const { title, shapeFields, member } = awardQuestion(template)
	await createOnBallot(
		ctx,
		{
			shape: "team_season_award",
			title,
			resolutionMode,
			resolutionSource:
				resolutionMode === "system"
					? autoResolutionSource("postseason")
					: ctx.resolutionSource,
			locksAt,
			lossRate,
		},
		shapeFields,
		teamOptions(pool),
		member,
	)
	return { created: 1, skipped: 0 }
}

// When a league's win totals lock: opening day plus its grace window. A
// league without an entry locks on opening day.
export function winTotalLockTime(
	leagueSlug: string,
	season: { regularSeasonStartsAt: Date },
): Date {
	const graceDays = LEAGUE_SEASON_FORMAT[leagueSlug]?.winTotalGraceDays ?? 0
	return new Date(
		season.regularSeasonStartsAt.getTime() + graceDays * 24 * 60 * 60 * 1000,
	)
}

// One discriminated-union catalog (RecurringQuestionTemplate), one generic
// engine - dispatched via ts-pattern so a future template kind is a union
// member + a match arm here, not a new system. Templates sharing a
// ballotGroup land in one shared ballot (find-or-created by
// (leagueId, seasonId, name), published immediately - see findOrCreateBallot
// above). Every question this
// creates goes through generateQuestionTitle, same as createQuestion's own
// server-trusted-client-title path does at the title's origin - there's no
// hand-written title anywhere in this engine.
export async function generateSeasonQuestions(params: {
	leagueId: string
	resolutionSource: string
	templates: RecurringQuestionTemplate[]
	createdBy: string
}): Promise<{ created: number; skipped: number }> {
	const league = await db.query.leagues.findFirst({
		where: { id: params.leagueId },
	})
	if (!league) {
		throw new Error(
			`generateSeasonQuestions: league ${params.leagueId} not found`,
		)
	}
	const season = await getCurrentSeason(params.leagueId)
	if (!season) return { created: 0, skipped: 0 }

	// Two different lock times, not one shared locksAt - a win-total guess
	// stays open for the league's grace window after opening day
	// (LEAGUE_SEASON_FORMAT.winTotalGraceDays), then locks. An award race is
	// still genuinely open all season - callers can call an MVP/DPOY/etc. pick
	// any time up to the season's end, they just score worse the later they
	// call (the early-tier multiplier in packages/scoring, which is exactly
	// why player_season_award/team_season_award are season-long shapes
	// there). Locking an award early would make that whole mechanic pointless.
	const winTotalLocksAt = winTotalLockTime(league.slug, season)
	const awardLocksAt = season.regularSeasonEndsAt

	// Past the grace window a win total isn't a guess anymore (by September,
	// an MLB one is mostly arithmetic) - filtered out here, before any ballot
	// gets created for it, so a fully-skipped group never leaves behind an
	// empty published ballot. Award shapes have no such cutoff - real award
	// races are still genuinely open all season.
	const winTotalsClosed = new Date() >= winTotalLocksAt
	const templates = params.templates.filter((t) => {
		if (t.shape === "team_season_stat_numeric_guess" && winTotalsClosed) {
			console.log(
				`[season-questions] skipping "${t.statName}" win-total generation for ${league.slug} - ${season.displayName} win totals locked ${winTotalLocksAt.toISOString()}`,
			)
			return false
		}
		return true
	})

	// A group's ballot position is the order it first appears in the league's
	// catalog array - no separate ordering config to keep in sync with the
	// group names, the array is already written group-adjacent. Built off the
	// unfiltered params.templates, not the filtered list above, so a mid-season
	// run assigns the same numbers a preseason one would: dropping Win Totals
	// once the season starts shouldn't shift every award ballot up one.
	const groupOrder = new Map<string, number>()
	for (const template of params.templates) {
		if (!groupOrder.has(template.ballotGroup)) {
			groupOrder.set(template.ballotGroup, groupOrder.size + 1)
		}
	}

	const templatesByGroup = new Map<string, RecurringQuestionTemplate[]>()
	for (const template of templates) {
		const list = templatesByGroup.get(template.ballotGroup) ?? []
		list.push(template)
		templatesByGroup.set(template.ballotGroup, list)
	}

	let created = 0
	let skipped = 0

	for (const [ballotGroup, groupTemplates] of templatesByGroup) {
		// No league name in the ballot name - a ballot is already scoped to one
		// league (leagueId), so repeating it in the title is just noise (e.g.
		// "2026 AL Gold Gloves", not "2026 MLB AL Gold Gloves").
		const ballot = await findOrCreateBallot({
			leagueId: params.leagueId,
			leagueSlug: league.slug,
			sportId: league.sportId,
			seasonId: season.id,
			seasonDisplayName: season.displayName,
			name: `${season.displayName} ${ballotGroup}`,
			sortOrder: groupOrder.get(ballotGroup) ?? 1,
			createdBy: params.createdBy,
		})

		for (const template of groupTemplates) {
			const ctx: GenerationContext = {
				leagueId: params.leagueId,
				leagueSlug: league.slug,
				sportId: league.sportId,
				seasonId: season.id,
				seasonYear: season.year,
				resolutionSource: params.resolutionSource,
				createdBy: params.createdBy,
				ballotId: ballot.id,
			}
			const result = await match(template)
				.with({ shape: "team_season_stat_numeric_guess" }, (t) =>
					generatePerTeamNumericGuess(ctx, t, winTotalLocksAt),
				)
				.with({ shape: "player_season_award" }, (t) =>
					generatePlayerSeasonAward(ctx, t, awardLocksAt),
				)
				.with({ shape: "team_season_award" }, (t) =>
					generateTeamSeasonAward(ctx, t, awardLocksAt),
				)
				.exhaustive()

			created += result.created
			skipped += result.skipped
		}
	}

	return { created, skipped }
}
