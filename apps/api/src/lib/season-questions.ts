import { generateQuestionTitle } from "@called-my-shot/schemas"
import { sql } from "drizzle-orm"
import { match } from "ts-pattern"
import { db } from "../db"
import type { RecurringQuestionTemplate } from "../db/catalog/recurring-question-catalog"
import {
	ballotQuestions,
	ballots,
	questionOptions,
	questions,
} from "../db/schema"
import { buildPlayerPool, buildTeamPool } from "./award-pool"
import { generateUniqueBallotSlug } from "./ballot-slug"
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

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

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

async function attachToBallot(
	tx: Tx,
	params: {
		ballotId: string
		questionId: string
		label: string
		slot?: string | null
		section?: string | null
	},
): Promise<void> {
	const [row] = await tx
		.select({
			maxSortOrder: sql<number>`coalesce(max(${ballotQuestions.sortOrder}), -1)`,
		})
		.from(ballotQuestions)
		.where(sql`${ballotQuestions.ballotId} = ${params.ballotId}`)
	await tx.insert(ballotQuestions).values({
		ballotId: params.ballotId,
		questionId: params.questionId,
		label: params.label,
		slot: params.slot ?? null,
		section: params.section ?? null,
		sortOrder: (row?.maxSortOrder ?? -1) + 1,
	})
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
async function generatePerTeamNumericGuess(params: {
	template: Extract<
		RecurringQuestionTemplate,
		{ shape: "team_season_stat_numeric_guess" }
	>
	leagueId: string
	sportId: string
	seasonId: string
	seasonYear: number
	resolutionSource: string
	locksAt: Date
	createdBy: string
	ballotId: string
}): Promise<{ created: number; skipped: number }> {
	// Sorted here rather than in the query so the ballot's own order comes
	// from the same comparator the section headings do (see team-grouping.ts)
	// - attachToBallot appends at max(sortOrder)+1, so iteration order IS the
	// rendered order, and a league's divisions come out as contiguous runs.
	const teamsInLeague = (
		await db.query.teams.findMany({ where: { leagueId: params.leagueId } })
	).sort(compareTeamsByGrouping)
	// Resolved against the whole league at once - whether a division name
	// needs its conference spelled out in front of it is a league-level
	// question (see teamSectionResolver).
	const sectionFor = teamSectionResolver(teamsInLeague)
	const stat = await db.query.stats.findFirst({
		where: { sportId: params.sportId, name: params.template.statName },
		with: { toleranceTier: true },
	})
	if (!stat?.toleranceTier) {
		throw new Error(
			`generatePerTeamNumericGuess: stat "${params.template.statName}" not found or missing a tolerance tier for sport ${params.sportId}`,
		)
	}
	const numericTolerancePct =
		stat.toleranceTier.toleranceMode === "absolute"
			? null
			: stat.toleranceTier.toleranceValue
	const numericToleranceAbsolute =
		stat.toleranceTier.toleranceMode === "absolute"
			? stat.toleranceTier.toleranceValue
			: null

	let created = 0
	let skipped = 0
	for (const team of teamsInLeague) {
		const existing = await db.query.questions.findFirst({
			where: {
				leagueId: params.leagueId,
				seasonId: params.seasonId,
				shape: "team_season_stat_numeric_guess",
				subjectTeamId: team.id,
			},
		})
		if (existing) {
			skipped++
			continue
		}

		const title = generateQuestionTitle({
			shape: "team_season_stat_numeric_guess",
			teamName: team.name,
			statName: params.template.statName,
			year: params.seasonYear,
		})

		await db.transaction(async (tx) => {
			const [question] = await tx
				.insert(questions)
				.values({
					shape: "team_season_stat_numeric_guess",
					title,
					creatorId: params.createdBy,
					isOfficial: true,
					sportId: params.sportId,
					leagueId: params.leagueId,
					seasonId: params.seasonId,
					resolutionSource: params.resolutionSource,
					locksAt: params.locksAt,
					statId: stat.id,
					statAggregation: "total",
					subjectTeamId: team.id,
					numericTolerancePct,
					numericToleranceAbsolute,
				})
				.returning()
			if (!question) {
				throw new Error(
					"generatePerTeamNumericGuess: question insert returned nothing",
				)
			}
			await attachToBallot(tx, {
				ballotId: params.ballotId,
				questionId: question.id,
				// Same slot/label convention as every award ballot member (see
				// generatePlayerSeasonAward below): slot is the short bold badge
				// ("LAL"), label is the full spelled-out text underneath it ("Los
				// Angeles Lakers") - not the other way around.
				label: team.name,
				slot: team.abbreviation,
				section: sectionFor(team),
			})
		})
		created++
	}
	return { created, skipped }
}

async function generatePlayerSeasonAward(params: {
	template: Extract<RecurringQuestionTemplate, { shape: "player_season_award" }>
	leagueId: string
	sportId: string
	seasonId: string
	resolutionSource: string
	locksAt: Date
	createdBy: string
	ballotId: string
}): Promise<{ created: number; skipped: number }> {
	// awardName alone isn't a unique key - MLB's "MVP" catalog entries share it
	// across two real awards (AL MVP, NL MVP), distinguished only by
	// awardConferences, so a candidate only counts as "already generated" if
	// its conference/division scope matches too.
	const candidates = await db.query.questions.findMany({
		where: {
			leagueId: params.leagueId,
			seasonId: params.seasonId,
			shape: "player_season_award",
			awardName: params.template.awardName,
		},
	})
	const existing = candidates.find(
		(q) =>
			sameFilterSet(q.awardConferences, params.template.awardConferences) &&
			sameFilterSet(q.awardDivisions, params.template.awardDivisions),
	)
	if (existing) return { created: 0, skipped: 1 }

	const pool = await buildPlayerPool(
		{ leagueId: params.leagueId },
		{
			conferences: params.template.awardConferences,
			divisions: params.template.awardDivisions,
			positions: params.template.awardPositions,
			seasonsInLeague: params.template.awardSeasonsInLeague,
			rookieOnly: params.template.awardRookieOnly,
		},
	)
	if (pool.length < params.template.picksRequired) {
		throw new Error(
			`generatePlayerSeasonAward: not enough players for "${params.template.awardName}" (need ${params.template.picksRequired}, found ${pool.length})`,
		)
	}

	const title = generateQuestionTitle({
		shape: "player_season_award",
		awardName: params.template.awardName,
		verb: params.template.awardVerb,
		picksRequired: params.template.picksRequired,
		awardConferences: params.template.awardConferences,
		awardDivisions: params.template.awardDivisions,
	})

	await db.transaction(async (tx) => {
		const [question] = await tx
			.insert(questions)
			.values({
				shape: "player_season_award",
				title,
				creatorId: params.createdBy,
				isOfficial: true,
				sportId: params.sportId,
				leagueId: params.leagueId,
				seasonId: params.seasonId,
				resolutionSource: params.resolutionSource,
				locksAt: params.locksAt,
				picksRequired: params.template.picksRequired,
				awardName: params.template.awardName,
				awardVerb: params.template.awardVerb,
				awardConferences: params.template.awardConferences?.length
					? params.template.awardConferences
					: null,
				awardDivisions: params.template.awardDivisions?.length
					? params.template.awardDivisions
					: null,
				awardPositions: params.template.awardPositions?.length
					? params.template.awardPositions
					: null,
				awardSeasonsInLeague: params.template.awardSeasonsInLeague?.length
					? params.template.awardSeasonsInLeague
					: null,
				awardRookieOnly: params.template.awardRookieOnly ?? null,
			})
			.returning()
		if (!question) {
			throw new Error(
				"generatePlayerSeasonAward: question insert returned nothing",
			)
		}
		await tx.insert(questionOptions).values(
			pool.map((player, index) => ({
				questionId: question.id,
				label: player.name,
				sortOrder: index,
				playerId: player.id,
			})),
		)
		await attachToBallot(tx, {
			ballotId: params.ballotId,
			questionId: question.id,
			label: params.template.label ?? params.template.awardName,
			slot: params.template.slot,
			section: params.template.ballotSection,
		})
	})
	return { created: 1, skipped: 0 }
}

async function generateTeamSeasonAward(params: {
	template: Extract<RecurringQuestionTemplate, { shape: "team_season_award" }>
	leagueId: string
	sportId: string
	seasonId: string
	resolutionSource: string
	locksAt: Date
	createdBy: string
	ballotId: string
}): Promise<{ created: number; skipped: number }> {
	// See the matching comment in generatePlayerSeasonAward above - awardName
	// alone isn't a unique key once two entries share a bare name distinguished
	// only by conference/division.
	const candidates = await db.query.questions.findMany({
		where: {
			leagueId: params.leagueId,
			seasonId: params.seasonId,
			shape: "team_season_award",
			awardName: params.template.awardName,
		},
	})
	const existing = candidates.find(
		(q) =>
			sameFilterSet(q.awardConferences, params.template.awardConferences) &&
			sameFilterSet(q.awardDivisions, params.template.awardDivisions),
	)
	if (existing) return { created: 0, skipped: 1 }

	const pool = await buildTeamPool(
		{ leagueId: params.leagueId },
		{
			conferences: params.template.awardConferences,
			divisions: params.template.awardDivisions,
		},
	)
	if (pool.length < params.template.picksRequired) {
		throw new Error(
			`generateTeamSeasonAward: not enough teams for "${params.template.awardName}" (need ${params.template.picksRequired}, found ${pool.length})`,
		)
	}

	const title = generateQuestionTitle({
		shape: "team_season_award",
		awardName: params.template.awardName,
		verb: params.template.awardVerb,
		picksRequired: params.template.picksRequired,
		awardConferences: params.template.awardConferences,
		awardDivisions: params.template.awardDivisions,
	})

	await db.transaction(async (tx) => {
		const [question] = await tx
			.insert(questions)
			.values({
				shape: "team_season_award",
				title,
				creatorId: params.createdBy,
				isOfficial: true,
				sportId: params.sportId,
				leagueId: params.leagueId,
				seasonId: params.seasonId,
				resolutionSource: params.resolutionSource,
				locksAt: params.locksAt,
				picksRequired: params.template.picksRequired,
				awardName: params.template.awardName,
				awardVerb: params.template.awardVerb,
				awardConferences: params.template.awardConferences?.length
					? params.template.awardConferences
					: null,
				awardDivisions: params.template.awardDivisions?.length
					? params.template.awardDivisions
					: null,
			})
			.returning()
		if (!question) {
			throw new Error(
				"generateTeamSeasonAward: question insert returned nothing",
			)
		}
		await tx.insert(questionOptions).values(
			pool.map((team, index) => ({
				questionId: question.id,
				label: team.name,
				sortOrder: index,
				teamId: team.id,
			})),
		)
		await attachToBallot(tx, {
			ballotId: params.ballotId,
			questionId: question.id,
			label: params.template.label ?? params.template.awardName,
			slot: params.template.slot,
			section: params.template.ballotSection,
		})
	})
	return { created: 1, skipped: 0 }
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
	// stops being a real prediction once the season starts (see the filter
	// below), so it locks then. An award race is still genuinely open all
	// season - callers can call an MVP/DPOY/etc. pick any time up to the
	// season's end, they just score worse the later they call (the early-tier
	// multiplier in packages/scoring, which is exactly why player_season_award/
	// team_season_award are season-long shapes there). Locking an award at
	// season start would make that whole mechanic pointless.
	const winTotalLocksAt = season.regularSeasonStartsAt
	const awardLocksAt = season.regularSeasonEndsAt

	// A win-total-style guess stops being a real prediction once the season
	// it's about has already started (by September, an MLB win total isn't a
	// guess anymore) - filtered out here, before any ballot gets created for
	// it, so a fully-skipped group never leaves behind an empty published
	// ballot. Award shapes have no such cutoff - real award races are still
	// genuinely open all season.
	const seasonAlreadyStarted = new Date() >= season.regularSeasonStartsAt
	const templates = params.templates.filter((t) => {
		if (t.shape === "team_season_stat_numeric_guess" && seasonAlreadyStarted) {
			console.log(
				`[season-questions] skipping "${t.statName}" win-total generation for ${league.slug} - ${season.displayName} season already started`,
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
			const result = await match(template)
				.with({ shape: "team_season_stat_numeric_guess" }, (t) =>
					generatePerTeamNumericGuess({
						template: t,
						leagueId: params.leagueId,
						sportId: league.sportId,
						seasonId: season.id,
						seasonYear: season.year,
						resolutionSource: params.resolutionSource,
						locksAt: winTotalLocksAt,
						createdBy: params.createdBy,
						ballotId: ballot.id,
					}),
				)
				.with({ shape: "player_season_award" }, (t) =>
					generatePlayerSeasonAward({
						template: t,
						leagueId: params.leagueId,
						sportId: league.sportId,
						seasonId: season.id,
						resolutionSource: params.resolutionSource,
						locksAt: awardLocksAt,
						createdBy: params.createdBy,
						ballotId: ballot.id,
					}),
				)
				.with({ shape: "team_season_award" }, (t) =>
					generateTeamSeasonAward({
						template: t,
						leagueId: params.leagueId,
						sportId: league.sportId,
						seasonId: season.id,
						resolutionSource: params.resolutionSource,
						locksAt: awardLocksAt,
						createdBy: params.createdBy,
						ballotId: ballot.id,
					}),
				)
				.exhaustive()

			created += result.created
			skipped += result.skipped
		}
	}

	return { created, skipped }
}
