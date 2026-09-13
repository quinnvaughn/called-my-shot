import {
	autoResolutionSource,
	championshipKeyFor,
} from "@called-my-shot/schemas"
import {
	type ApplyContext,
	applyDecision,
	isAttemptDue,
} from "../../lib/auto-resolve/apply"
import { findChampionshipWinner } from "../../lib/auto-resolve/championship"
import { type Decision, fail } from "../../lib/auto-resolve/decide"
import { isMainModule } from "../../lib/is-main-module"
import { db } from "../index"
import { EspnRequestError, fetchPostseasonScoreboard } from "./espn-client"
import {
	createEspnRequester,
	DEFAULT_ESPN_SPACING_MS,
	type EspnRequester,
} from "./espn-requester"
import { SYNCED_LEAGUES } from "./leagues"

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS

// ESPN's postseason end date is the schedule's, not the result's, so a
// championship it still doesn't show as decided this long after that date is
// handed to an admin.
export const CHAMPIONSHIP_GRACE_MS = 72 * HOUR_MS

const RESOLVED_NOTE = "Resolved automatically from ESPN's postseason results."
const VOIDED_NOTE = "Voided automatically from ESPN's postseason results."

const CANDIDATE_RELATIONS = {
	season: true,
	league: true,
	options: true,
	autoResolution: true,
} as const

async function loadCandidates(now: Date) {
	const [unsettled, awaitingRecheck] = await Promise.all([
		db.query.questions.findMany({
			where: {
				resolutionMode: "system",
				shape: "team_season_award",
				status: { in: ["open", "locked"] },
				locksAt: { lte: now },
			},
			with: CANDIDATE_RELATIONS,
		}),
		db.query.questions.findMany({
			where: {
				resolutionMode: "system",
				resolutionMethod: "system",
				shape: "team_season_award",
				status: { in: ["resolved", "voided"] },
				autoResolution: {
					recheckDueAt: { lte: now },
					recheckedAt: { isNull: true },
				},
			},
			with: CANDIDATE_RELATIONS,
		}),
	])

	return [...unsettled, ...awaitingRecheck].filter((question) =>
		isAttemptDue(question, now),
	)
}

type Candidate = Awaited<ReturnType<typeof loadCandidates>>[number]

const espnIdOf = (sourceId: string) => sourceId.split(":")[1] ?? sourceId

// ESPN's scoreboard takes US calendar dates.
const espnDate = (date: Date) =>
	date.toISOString().slice(0, 10).replaceAll("-", "")

async function loadTeamIdByEspnTeamId(group: Candidate[]) {
	const teamIds = [
		...new Set(
			group.flatMap((q) =>
				q.options.flatMap((o) => (o.teamId ? [o.teamId] : [])),
			),
		),
	]
	if (teamIds.length === 0) return new Map<string, string>()
	const refs = await db.query.externalRefs.findMany({
		where: { source: "espn", entityType: "team", entityId: { in: teamIds } },
	})
	return new Map(refs.map((ref) => [espnIdOf(ref.sourceId), ref.entityId]))
}

// Reads one league season's postseason scoreboard once, then settles every
// championship it has decided. Nothing happens before the postseason starts.
async function processSeason(
	group: Candidate[],
	requester: EspnRequester,
	now: Date,
): Promise<void> {
	const season = group[0]?.season
	const league = group[0]?.league
	if (!season?.postseasonStartsAt || !league) return
	if (season.postseasonStartsAt > now) return

	const scheduledEnd = season.postseasonEndsAt ?? now
	const giveUpAt = new Date(scheduledEnd.getTime() + CHAMPIONSHIP_GRACE_MS)
	const contextFor = (resolutionSourceUrl: string | null): ApplyContext => ({
		now,
		escalateAt: giveUpAt,
		resolutionSource: autoResolutionSource("postseason"),
		resolutionSourceUrl,
		resolvedNote: RESOLVED_NOTE,
		voidedNote: VOIDED_NOTE,
	})
	const applyAll = async (decision: Decision) => {
		for (const question of group) {
			await applyDecision(question.id, decision, contextFor(null))
		}
	}

	const config = SYNCED_LEAGUES.find((c) => c.leagueSlug === league.slug)
	if (!config) {
		await applyAll(
			fail("missing_external_ref", `${league.slug} isn't synced from ESPN`),
		)
		return
	}

	const rangeStart = new Date(season.postseasonStartsAt.getTime() - DAY_MS)
	const rangeEnd = new Date(
		Math.min(now.getTime(), scheduledEnd.getTime() + 3 * DAY_MS),
	)
	const events = await requester.request(
		`${league.slug} postseason ${season.year}`,
		() =>
			fetchPostseasonScoreboard(
				config.espnPath,
				espnDate(rangeStart),
				espnDate(rangeEnd),
			),
	)
	if (!events) {
		await applyAll(
			fail("fetch_failed", "couldn't fetch the postseason scoreboard"),
		)
		return
	}

	const teamIdByEspnTeamId = await loadTeamIdByEspnTeamId(group)
	for (const question of group) {
		const key = championshipKeyFor({ ...question, leagueSlug: league.slug })
		if (!key) {
			await applyDecision(
				question.id,
				fail("unmapped", "this award doesn't settle automatically"),
				contextFor(null),
			)
			continue
		}

		const winner = findChampionshipWinner(key, events)
		if (!winner) {
			// Still being played, most likely. Only once the schedule's end is well
			// past does an undecided round count as a failure.
			if (now >= giveUpAt) {
				await applyDecision(
					question.id,
					fail(
						"box_score_not_final",
						`ESPN doesn't show the ${question.awardName} as decided`,
					),
					contextFor(null),
				)
			}
			continue
		}

		const teamId = teamIdByEspnTeamId.get(winner.espnTeamId)
		const option = teamId
			? question.options.find((o) => o.teamId === teamId)
			: undefined
		await applyDecision(
			question.id,
			option
				? { kind: "resolve", correctOptionIds: [option.id], evidence: {} }
				: fail(
						"leader_not_in_pool",
						`ESPN team ${winner.espnTeamId} won but isn't an option`,
					),
			contextFor(
				`https://www.espn.com/${league.slug}/game/_/gameId/${winner.espnEventId}`,
			),
		)
	}
}

export async function autoResolveChampionships({
	now = new Date(),
	spacingMs = DEFAULT_ESPN_SPACING_MS,
}: {
	now?: Date
	spacingMs?: number
} = {}): Promise<void> {
	const candidates = await loadCandidates(now)
	if (candidates.length === 0) {
		console.log("[auto-resolve-championships] nothing due")
		return
	}

	const bySeason = new Map<string, Candidate[]>()
	for (const question of candidates) {
		bySeason.set(question.seasonId, [
			...(bySeason.get(question.seasonId) ?? []),
			question,
		])
	}

	const requester = createEspnRequester("auto-resolve-championships", spacingMs)
	for (const [seasonId, group] of bySeason) {
		try {
			await processSeason(group, requester, now)
		} catch (err) {
			// ESPN refusing us ends the run; anything else is one season's problem.
			if (err instanceof EspnRequestError) throw err
			console.error(
				`[auto-resolve-championships] season ${seasonId} failed:`,
				err,
			)
		}
	}

	console.log(
		`[auto-resolve-championships] ${candidates.length} question(s) across ${bySeason.size} season(s), ${requester.count()} ESPN request(s)`,
	)
}

if (isMainModule(import.meta.url)) {
	autoResolveChampionships()
		.then(() => process.exit(0))
		.catch((err) => {
			console.error(err)
			process.exit(1)
		})
}
