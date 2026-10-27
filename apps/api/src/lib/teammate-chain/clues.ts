import { rushmorePositionsFor } from "@called-my-shot/schemas"
import { and, eq, sql } from "drizzle-orm"
import { db } from "../../db"
import {
	playerFranchiseStints,
	players,
	playerTeamSeasons,
	teamSeasons,
	teams,
} from "../../db/schema"
import { type SeasonLeague, seasonLabel } from "../season-puzzles/archive-parse"
import { CHAIN_CLUE_COUNT } from "./play"

// The clues a hint gives about a mystery teammate, vaguest first, never his
// name:
//   1. a team-season he shared with the chain's last player, where to look;
//   2. his position and the years he played;
//   3. how he came into the league, and whether he's a Hall of Famer;
//   4. his initials.

export type MysteryFacts = {
	// The most recent team-season the two shared, or null when they're
	// teammates only through today's rosters.
	shared: { teamName: string; season: number } | null
	// Today's team, for a pair who are teammates only now.
	currentTeam: string | null
	positions: string[]
	firstSeason: number | null
	lastSeason: number | null
	draft: { year: number; round: number | null; overall: number | null } | null
	hallOfFame: boolean
	name: string
}

export function initials(name: string): string {
	return name
		.split(/\s+/)
		.filter((word) => /^[A-Za-z]/.test(word))
		.filter((word) => !/^(Jr\.?|Sr\.?|II|III|IV)$/.test(word))
		.map((word) => `${word[0]?.toUpperCase()}.`)
		.join(" ")
}

function draftLine(draft: MysteryFacts["draft"]): string {
	if (!draft) return ""
	if (draft.overall === null)
		return `Came into the league undrafted in ${draft.year}.`
	if (draft.round === null)
		return `Drafted in ${draft.year}, pick ${draft.overall}.`
	return `Drafted in ${draft.year}, round ${draft.round}, pick ${draft.overall} overall.`
}

// Every clue, in order. A clue with nothing to say falls back to what's
// known, so there are always CHAIN_CLUE_COUNT.
export function mysteryClues(
	league: SeasonLeague,
	leagueAbbreviation: string,
	facts: MysteryFacts,
): string[] {
	const labels = new Map(
		rushmorePositionsFor(leagueAbbreviation).map((p) => [p.code, p.label]),
	)
	const positions = facts.positions
		.map((code) => labels.get(code))
		.filter((label): label is string => !!label)
		.slice(0, 2)
	const years =
		facts.firstSeason && facts.lastSeason
			? facts.firstSeason === facts.lastSeason
				? `Played in ${facts.firstSeason}.`
				: `Played from ${facts.firstSeason} to ${facts.lastSeason}.`
			: ""
	return [
		facts.shared
			? `Look at the ${seasonLabel(league, facts.shared.season)} ${facts.shared.teamName}.`
			: `Look at today's ${facts.currentTeam ?? "roster"}.`,
		[positions.length > 0 ? `Position: ${positions.join(", ")}.` : "", years]
			.filter(Boolean)
			.join(" ") || "No position on record.",
		[
			draftLine(facts.draft),
			facts.hallOfFame ? "A Hall of Famer." : "Not in the Hall of Fame.",
		]
			.filter(Boolean)
			.join(" "),
		`Initials: ${initials(facts.name)}`,
	].slice(0, CHAIN_CLUE_COUNT)
}

// What the clues read about `mysteryId`, a teammate of `endId`.
export async function loadMysteryFacts(
	leagueId: string,
	endId: string,
	mysteryId: string,
): Promise<MysteryFacts | null> {
	const [player] = await db
		.select({ name: players.name, currentTeamId: players.currentTeamId })
		.from(players)
		.where(eq(players.id, mysteryId))
	if (!player) return null

	const [sharedRows, stints, draft, endRow] = await Promise.all([
		db.execute<{ team_id: string; season: number }>(sql`
			select m.team_id, m.season
			from ${playerTeamSeasons} m
			join ${playerTeamSeasons} e
				on e.team_id = m.team_id and e.season = m.season
			where m.player_id = ${mysteryId} and e.player_id = ${endId}
			order by m.season desc
			limit 1
		`),
		db
			.select({
				firstSeason: playerFranchiseStints.firstSeason,
				lastSeason: playerFranchiseStints.lastSeason,
				seasons: playerFranchiseStints.seasons,
				positions: playerFranchiseStints.positions,
				hallOfFame: playerFranchiseStints.hallOfFame,
			})
			.from(playerFranchiseStints)
			.innerJoin(teams, eq(teams.id, playerFranchiseStints.teamId))
			.where(
				and(
					eq(playerFranchiseStints.playerId, mysteryId),
					eq(teams.leagueId, leagueId),
				),
			),
		db.query.draftEntries.findFirst({
			where: { playerId: mysteryId, leagueId },
		}),
		db
			.select({ currentTeamId: players.currentTeamId })
			.from(players)
			.where(eq(players.id, endId)),
	])

	const sharedRow = sharedRows.rows[0]
	let shared: MysteryFacts["shared"] = null
	if (sharedRow) {
		const [named] = await db
			.select({ name: teamSeasons.name })
			.from(teamSeasons)
			.where(
				and(
					eq(teamSeasons.teamId, sharedRow.team_id),
					eq(teamSeasons.year, sharedRow.season),
				),
			)
		const [team] = await db
			.select({ name: teams.name })
			.from(teams)
			.where(eq(teams.id, sharedRow.team_id))
		shared = {
			teamName: named?.name ?? team?.name ?? "team",
			season: sharedRow.season,
		}
	}
	let currentTeam: string | null = null
	if (
		!shared &&
		player.currentTeamId &&
		player.currentTeamId === endRow[0]?.currentTeamId
	) {
		const [team] = await db
			.select({ name: teams.name })
			.from(teams)
			.where(eq(teams.id, player.currentTeamId))
		currentTeam = team?.name ?? null
	}
	// Positions from the longest stints first.
	const positions = [
		...new Set(
			[...stints]
				.sort((a, b) => b.seasons - a.seasons)
				.flatMap((stint) => stint.positions),
		),
	]
	return {
		shared,
		currentTeam,
		positions,
		firstSeason:
			stints.length > 0 ? Math.min(...stints.map((s) => s.firstSeason)) : null,
		lastSeason:
			stints.length > 0 ? Math.max(...stints.map((s) => s.lastSeason)) : null,
		draft: draft
			? { year: draft.year, round: draft.round, overall: draft.overall }
			: null,
		hallOfFame: stints.some((stint) => stint.hallOfFame),
		name: player.name,
	}
}
