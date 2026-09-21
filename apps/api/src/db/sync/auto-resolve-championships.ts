import {
	autoResolutionSource,
	championshipKeyFor,
} from "@called-my-shot/schemas"
import { autoResolveNotes } from "../../lib/auto-resolve/apply"
import { findChampionshipWinner } from "../../lib/auto-resolve/championship"
import { fail } from "../../lib/auto-resolve/decide"
import { AUTO_RESOLVE_CHAMPIONSHIPS_LOCK } from "../../lib/job-lock"
import { runCli } from "../../lib/run-cli"
import { DAY_MS, HOUR_MS } from "../../lib/time"
import { db } from "../index"
import {
	type AutoResolveJobOptions,
	type AutoResolveRun,
	applierFor,
	loadDueCandidates,
	runAutoResolveJob,
} from "./auto-resolve-job"
import { SYNCED_LEAGUES } from "./leagues"
import { byEspnId, loadEspnIds } from "./sync-refs"

// ESPN's postseason end date is the schedule's, not the result's, so a
// championship it still doesn't show as decided this long after that date is
// handed to an admin.
export const CHAMPIONSHIP_GRACE_MS = 72 * HOUR_MS

const NOTES = autoResolveNotes("ESPN's postseason results")

const loadCandidates = (now: Date) =>
	loadDueCandidates(now, (due) =>
		db.query.questions.findMany({
			where: { resolutionMode: "system", shape: "team_season_award", ...due },
			with: {
				season: true,
				league: true,
				options: true,
				autoResolution: true,
			},
		}),
	)

type Candidate = Awaited<ReturnType<typeof loadCandidates>>[number]

// ESPN's scoreboard takes US calendar dates.
const espnDate = (date: Date) =>
	date.toISOString().slice(0, 10).replaceAll("-", "")

// Reads one league season's postseason scoreboard once, then settles every
// championship it has decided. Nothing happens before the postseason starts.
async function processSeason(
	group: Candidate[],
	{ now, espn, requester }: AutoResolveRun,
): Promise<void> {
	const season = group[0]?.season
	const league = group[0]?.league
	if (!season?.postseasonStartsAt || !league) return
	if (season.postseasonStartsAt > now) return

	const scheduledEnd = season.postseasonEndsAt ?? now
	const giveUpAt = new Date(scheduledEnd.getTime() + CHAMPIONSHIP_GRACE_MS)
	const { apply, applyAll } = applierFor(group, {
		now,
		escalateAt: giveUpAt,
		resolutionSource: autoResolutionSource("postseason"),
		...NOTES,
	})

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
			espn.fetchPostseasonScoreboard(
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

	const teamIdByEspnTeamId = byEspnId(
		await loadEspnIds(
			"team",
			group.flatMap((q) =>
				q.options.flatMap((o) => (o.teamId ? [o.teamId] : [])),
			),
		),
	)
	for (const question of group) {
		const key = championshipKeyFor({ ...question, leagueSlug: league.slug })
		if (!key) {
			await apply(
				question.id,
				fail("unmapped", "this award doesn't settle automatically"),
			)
			continue
		}

		const winner = findChampionshipWinner(key, events)
		if (!winner) {
			// Still being played, most likely. Only once the schedule's end is well
			// past does an undecided round count as a failure.
			if (now >= giveUpAt) {
				await apply(
					question.id,
					fail(
						"box_score_not_final",
						`ESPN doesn't show the ${question.awardName} as decided`,
					),
				)
			}
			continue
		}

		const teamId = teamIdByEspnTeamId.get(winner.espnTeamId)
		const option = teamId
			? question.options.find((o) => o.teamId === teamId)
			: undefined
		await apply(
			question.id,
			option
				? { kind: "resolve", correctOptionIds: [option.id], evidence: {} }
				: fail(
						"leader_not_in_pool",
						`ESPN team ${winner.espnTeamId} won but isn't an option`,
					),
			`https://www.espn.com/${league.slug}/game/_/gameId/${winner.espnEventId}`,
		)
	}
}

export function autoResolveChampionships(
	options: AutoResolveJobOptions = {},
): Promise<void> {
	return runAutoResolveJob(
		{
			name: "auto-resolve-championships",
			unit: "season",
			loadCandidates,
			groupKey: (question) => question.seasonId,
			processGroup: processSeason,
		},
		options,
	)
}

runCli(import.meta.url, autoResolveChampionships, {
	lock: AUTO_RESOLVE_CHAMPIONSHIPS_LOCK,
})
