import { and, eq, sql } from "drizzle-orm"
import { RECHECK_DELAY_MS } from "../../lib/auto-resolve/apply"
import { resolveQuestionInternal } from "../../lib/resolve-question"
import { db } from "../index"
import type { League } from "../schema"
import {
	games,
	questionAutoResolutions,
	questions,
	teamRecords,
} from "../schema"
import {
	type EspnEvent,
	type EspnEventStatus,
	fetchSchedule,
	fetchTeams,
} from "./espn-client"
import type { SyncLeagueConfig } from "./leagues"
import { deriveNflSlot } from "./nfl-slot"
import { findRefEntityId, linkRef, scopedSourceId, type Tx } from "./sync-refs"

// 2 = regular season, 3 = postseason - matches SYNCED_SEASON_TYPES in
// espn-client.ts, the only two types this app ever syncs.
function toGameSeasonType(espnSeasonType: number): "regular" | "postseason" {
	return espnSeasonType === 3 ? "postseason" : "regular"
}

// ESPN's status vocabulary collapses onto this app's 3-value gameStatus enum
// - anything not explicitly final/in-progress (postponed, delayed, etc.)
// reads as "scheduled" rather than growing the enum for states this app
// doesn't otherwise act on. Exported - db/sync/sync-live-scores.ts (the
// frequent, narrow job that actually keeps a game's status current while
// it's in flight) uses the exact same mapping, not a parallel one.
export function toGameStatus(
	status: EspnEventStatus,
): "scheduled" | "live" | "final" {
	if (status.type.name === "STATUS_FINAL") return "final"
	if (status.type.name === "STATUS_IN_PROGRESS") return "live"
	return "scheduled"
}

// The games.finalizedAt value to write alongside a synced status. Keeps an
// existing stamp rather than moving it, so it records the first sync that saw
// the game final; clears it if ESPN ever takes the final back.
export function finalizedAtFor(status: "scheduled" | "live" | "final") {
	return status === "final" ? sql`coalesce(${games.finalizedAt}, now())` : null
}

// ESPN's record.displayValue is a plain "W-L" (most sports) or "W-L-T" (NFL,
// on the rare tie) string - there's no independent source of truth for a
// team's record on this app's side to derive it from instead, so it's parsed
// verbatim rather than computed. Missing tie segment reads as 0, same as
// every other sport that doesn't have one.
export function parseRecord(displayValue: string): {
	wins: number
	losses: number
	ties: number
} {
	const [wins = 0, losses = 0, ties = 0] = displayValue.split("-").map(Number)
	return { wins, losses, ties }
}

// Matched by date range against whatever's synced for this league (see
// sync-seasons.ts, which must run before this file per run.ts's ordering) -
// a game's season is never known some other way. games.seasonId is NOT
// NULL, so a miss here means syncEvent skips the game entirely rather than
// writing it with no season - the next run picks it up once seasons catch up
// (a brand-new season year not synced yet, or a date right at a boundary).
async function findSeasonId(
	tx: Tx,
	leagueId: string,
	startsAt: Date,
): Promise<string | null> {
	const leagueSeasons = await tx.query.seasons.findMany({ where: { leagueId } })
	const match = leagueSeasons.find(
		(s) =>
			s.regularSeasonStartsAt <= startsAt &&
			startsAt <= (s.postseasonEndsAt ?? s.regularSeasonEndsAt),
	)
	return match?.id ?? null
}

// Resolves this game's team_vs_team ("who wins?") question off the final
// score it was just synced with. Lives here (not sync-live-scores.ts alone)
// and is called from both syncEvent below and sync-live-scores.ts's own
// loop, because either sync path can be the one that observes a game go
// final first - sync-live-scores.ts's window is narrow (games plausibly
// still in flight) and can miss a game if that job's cron run gets delayed,
// while this full sweep runs daily and touches every game regardless of
// timing. Without this living in both places, a game finalizing outside
// sync-live-scores.ts's window would get its score written by this file's
// syncEvent but never get its question resolved. Mirrors the eligibility
// checks resolveQuestion/adminResolveQuestion each do before calling
// resolveQuestionInternal (that function has none of its own by design -
// see its own comment) plus a row lock, since this can run again on a game
// already marked final without excluding it from the next query - if a
// prior run's resolution attempt failed partway, this is what lets a later
// run pick it back up rather than leaving it stuck open forever.
export async function resolveGameWinner(
	tx: Tx,
	gameId: string,
	homeTeamId: string,
	awayTeamId: string,
	homeScore: number | null,
	awayScore: number | null,
	now: Date = new Date(),
): Promise<void> {
	// A tie has no winning option to mark (team_vs_team has no tie option -
	// see sync-game-questions.ts) - leave it for manual resolution rather
	// than guessing. Rare (NFL only), but a real possibility.
	if (homeScore === null || awayScore === null || homeScore === awayScore) {
		return
	}

	const [question] = await tx
		.select()
		.from(questions)
		.where(
			and(eq(questions.gameId, gameId), eq(questions.shape, "team_vs_team")),
		)
		.for("update")
	// No question yet (outside syncGameQuestions' create window at the time,
	// or a game predating that sync), or already settled by some path - only
	// an open or locked question is still waiting on a result.
	if (
		!question ||
		(question.status !== "open" && question.status !== "locked")
	) {
		return
	}

	const options = await tx.query.questionOptions.findMany({
		where: { questionId: question.id },
	})
	const winningTeamId = homeScore > awayScore ? homeTeamId : awayTeamId
	const winningOption = options.find((o) => o.teamId === winningTeamId)
	if (!winningOption) {
		console.error(
			`[sync-games] question ${question.id}: no option matches winning team ${winningTeamId} - skipping`,
		)
		return
	}

	await resolveQuestionInternal(
		tx,
		question,
		{
			correctOptionIds: [winningOption.id],
			resolutionNote: "Resolved automatically from ESPN's final score.",
		},
		{ resolvedBy: { method: "system" } },
	)
	// ESPN can still correct a final score, so auto-resolve-games reads the box
	// score once more after RECHECK_DELAY_MS, the same re-check every other
	// automatic result gets.
	const settled = {
		attempts: 1,
		lastAttemptAt: now,
		settledAt: now,
		recheckDueAt: new Date(now.getTime() + RECHECK_DELAY_MS),
		evidence: { home: homeScore, away: awayScore },
	}
	await tx
		.insert(questionAutoResolutions)
		.values({ questionId: question.id, ...settled })
		.onConflictDoUpdate({
			target: questionAutoResolutions.questionId,
			set: settled,
		})
	console.log(`[sync-games] resolved question ${question.id}`)
}

async function syncEvent(
	tx: Tx,
	leagueSlug: string,
	leagueId: string,
	event: EspnEvent,
): Promise<void> {
	const competition = event.competitions[0]
	const [home, away] = competition.competitors
	const homeTeamId = await findRefEntityId(
		tx,
		"team",
		scopedSourceId(leagueSlug, home.team.id),
	)
	const awayTeamId = await findRefEntityId(
		tx,
		"team",
		scopedSourceId(leagueSlug, away.team.id),
	)
	if (!homeTeamId || !awayTeamId) {
		throw new Error(
			`syncGames: missing synced team for event ${event.id} - run syncTeams first`,
		)
	}

	const startsAt = new Date(event.date)
	const seasonId = await findSeasonId(tx, leagueId, startsAt)
	if (!seasonId) {
		console.warn(
			`syncGames: no synced season covers ${startsAt.toISOString()} for league ${leagueId} (event ${event.id}) - skipping until seasons catch up`,
		)
		return
	}
	const seasonType = toGameSeasonType(event.seasonType.type)
	// week/slot only mean anything for a week-window league (NFL, for now) -
	// gated on leagueSlug rather than trusting event.week's mere presence,
	// since ESPN's schedule responses carry a week number for every sport
	// (a generic "week of the season" grouping), not just the ones where a
	// week is the real scheduling unit MLB/NBA are browsed by day, not week,
	// so storing it there would just be stray, unused data contradicting the
	// "null for date-window leagues" invariant on games.weekNumber.
	const isWeekWindowLeague = leagueSlug === "nfl"
	const weekNumber = isWeekWindowLeague ? (event.week?.number ?? null) : null
	const slot = isWeekWindowLeague ? deriveNflSlot(startsAt) : null

	const venue = competition.venue?.fullName ?? null
	const status = toGameStatus(competition.status)
	const homeScore = home.score ? Math.round(home.score.value) : null
	const awayScore = away.score ? Math.round(away.score.value) : null

	const sourceId = scopedSourceId(leagueSlug, event.id)
	const existingId = await findRefEntityId(tx, "game", sourceId)
	if (existingId) {
		await tx
			.update(games)
			.set({
				homeTeamId,
				awayTeamId,
				startsAt,
				seasonId,
				seasonType,
				weekNumber,
				slot,
				venue,
				status,
				homeScore,
				awayScore,
				finalizedAt: finalizedAtFor(status),
			})
			.where(eq(games.id, existingId))
		if (status === "final") {
			await resolveGameWinner(
				tx,
				existingId,
				homeTeamId,
				awayTeamId,
				homeScore,
				awayScore,
			)
		}
		return
	}
	const [row] = await tx
		.insert(games)
		.values({
			leagueId,
			homeTeamId,
			awayTeamId,
			startsAt,
			seasonId,
			seasonType,
			weekNumber,
			slot,
			venue,
			status,
			homeScore,
			awayScore,
			finalizedAt: status === "final" ? new Date() : null,
		})
		.returning()
	if (!row)
		throw new Error(`syncGames: insert returned nothing for ${event.id}`)
	await linkRef(tx, "game", sourceId, row.id)
	// A brand-new row can't already have a team_vs_team question (that's
	// created by a later step in run.ts's pipeline), so nothing to resolve
	// on this branch yet - a final score on first sight is only possible for
	// backfilled historical games, which this app doesn't otherwise handle.
}

// The record on the most recently COMPLETED event is this team's current
// one; before any game has finished (start of season), the earliest
// scheduled event's record (always "0-0") is the closest thing to "current"
// there is. Either way, it's ESPN's own number for that specific event, not
// something summed/recomputed from other games - same "trust the upstream
// source" call as toGameStatus/parseRecord above.
async function syncTeamRecord(
	tx: Tx,
	leagueId: string,
	leagueSlug: string,
	espnTeamId: string,
	schedule: EspnEvent[],
): Promise<void> {
	const sorted = [...schedule].sort(
		(a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
	)
	const completed = sorted.filter(
		(e) => e.competitions[0].status.type.completed,
	)
	const reference = completed.at(-1) ?? sorted[0]
	if (!reference) return

	const competitor = reference.competitions[0].competitors.find(
		(c) => c.team.id === espnTeamId,
	)
	const total = competitor?.record?.find((r) => r.type === "total")
	if (!total) return

	const teamId = await findRefEntityId(
		tx,
		"team",
		scopedSourceId(leagueSlug, espnTeamId),
	)
	const seasonId = await findSeasonId(tx, leagueId, new Date(reference.date))
	if (!teamId || !seasonId) return

	const { wins, losses, ties } = parseRecord(total.displayValue)
	await tx
		.insert(teamRecords)
		.values({ teamId, seasonId, wins, losses, ties })
		.onConflictDoUpdate({
			target: [teamRecords.teamId, teamRecords.seasonId],
			set: { wins, losses, ties, updatedAt: new Date() },
		})
}

// Requires syncTeams(config) to have already run for this league - each
// event's home/away teams are looked up via their externalRefs mappings.
// Each event shows up in both teams' schedules; the ESPN event id (via
// externalRefs) is what dedupes it down to one row.
export async function syncGames(
	config: SyncLeagueConfig,
	league: League,
): Promise<void> {
	const espnTeams = await fetchTeams(config.espnPath)

	for (const espnTeam of espnTeams) {
		const schedule = await fetchSchedule(config.espnPath, espnTeam.id)
		for (const event of schedule) {
			await db.transaction((tx) =>
				syncEvent(tx, config.leagueSlug, league.id, event),
			)
		}
		await db.transaction((tx) =>
			syncTeamRecord(tx, league.id, config.leagueSlug, espnTeam.id, schedule),
		)
	}
}
