import { resolutionModeFor } from "@called-my-shot/schemas"
import { match } from "ts-pattern"
import type { GameQuestionTemplate } from "../../db/catalog/game-question-catalog"
import type { Game, Player } from "../../db/schema"
import { DAY_MS, HOUR_MS, MINUTE_MS } from "../time"
import {
	eligibleStarters,
	isPlayable,
	type StarterCandidate,
	type StarterPick,
	startersPosted,
} from "./pick-subjects"

// NBA and MLB questions go up about a day ahead of the game: late enough that
// starters are mostly known, early enough to be called over a whole day.
const DAILY_WINDOW_MS = 30 * HOUR_MS

// A game this close to starting gets nothing new and loses nothing: whatever
// is on it by now is what people are calling.
const MIN_LEAD_MS = 60 * MINUTE_MS

export type GenerationWindow = { kind: "ahead"; ms: number } | { kind: "week" }

export function windowFor(leagueSlug: string): GenerationWindow | null {
	return match(leagueSlug)
		.returnType<GenerationWindow | null>()
		.with("nba", "mlb", "nhl", () => ({ kind: "ahead", ms: DAILY_WINDOW_MS }))
		.with("nfl", () => ({ kind: "week" }))
		.otherwise(() => null)
}

type WindowGame = Pick<
	Game,
	"startsAt" | "seasonId" | "seasonType" | "weekNumber"
>

// The upcoming games a window covers, soonest first. An NFL week is the one
// the next game belongs to, taken whole, so a week's questions all go up once
// the previous week's last game has kicked off. A game without a week number
// falls back to the seven days ahead.
export function gamesInWindow<G extends WindowGame>(
	upcoming: G[],
	window: GenerationWindow,
	now: Date,
): G[] {
	const msUntil = (game: G) => game.startsAt.getTime() - now.getTime()
	const sorted = upcoming
		.filter((game) => msUntil(game) > 0)
		.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())

	const covered = match(window)
		.with({ kind: "ahead" }, ({ ms }) =>
			sorted.filter((game) => msUntil(game) <= ms),
		)
		.with({ kind: "week" }, () => {
			const next = sorted[0]
			if (!next) return []
			if (next.weekNumber === null) {
				return sorted.filter((game) => msUntil(game) <= 7 * DAY_MS)
			}
			return sorted.filter(
				(game) =>
					game.seasonId === next.seasonId &&
					game.seasonType === next.seasonType &&
					game.weekNumber === next.weekNumber,
			)
		})
		.exhaustive()

	return covered.filter((game) => msUntil(game) >= MIN_LEAD_MS)
}

// Templates whose questions would settle from ESPN on their own. Anything that
// wouldn't is left out, so no generated question ever needs a person to grade
// it. A numeric guess also needs its stat's tolerance tier to be graded.
export function systemTemplates(
	leagueSlug: string,
	templates: GameQuestionTemplate[],
	statsByName: Map<string, { toleranceTier: object | null }>,
): GameQuestionTemplate[] {
	return templates.filter((template) => {
		const stat = statsByName.get(template.statName)
		const settles =
			stat !== undefined &&
			resolutionModeFor({
				shape: template.shape,
				leagueSlug,
				statName: template.statName,
			}) === "system" &&
			(template.shape !== "team_stat_numeric_guess" || !!stat.toleranceTier)
		if (!settles) {
			console.error(
				`[generate-game-questions] ${leagueSlug} template ${template.id} skipped: "${template.statName}" can't settle automatically`,
			)
		}
		return settles
	})
}

// A team's roster players at the pick's positions who can actually play,
// shaped like starters in the pick's role. No lineup has posted yet when this
// runs, so the roster's own injury designation is the only thing standing
// between a player on the IL and a question about what he does tonight.
export function rosterCandidates(
	roster: Pick<Player, "id" | "position" | "positions" | "injuryStatus">[],
	teamId: string,
	pick: StarterPick,
): StarterCandidate[] {
	return roster
		.filter(
			(player) =>
				(!pick.positions ||
					player.positions.some((position) =>
						pick.positions?.includes(position),
					)) &&
				isPlayable(player.injuryStatus),
		)
		.map((player, index) => ({
			playerId: player.id,
			teamId,
			role: pick.role,
			position: player.position,
			sortOrder: index + 1,
			injuryStatus: player.injuryStatus,
		}))
}

// Ruled out once the roster says this player can't play, or once ESPN lists
// the team's starters in the pick's role without him among the ones who can.
// The roster check stands on its own because a lineup may never post in time
// to catch it: an MLB question goes up about a day out, and a player who lands
// on the IL in between would otherwise sit there until first pitch.
export function isRuledOut(
	starters: StarterCandidate[],
	teamId: string,
	playerId: string,
	pick: StarterPick,
	isUnavailable: (playerId: string) => boolean,
): boolean {
	if (isUnavailable(playerId)) return true
	return (
		startersPosted(starters, teamId, pick.role) &&
		!eligibleStarters(starters, teamId, pick).some(
			(starter) => starter.playerId === playerId,
		)
	)
}

// Whether an existing question is about a player who's no longer starting.
// Team guesses and leader questions aren't about one player, so they never
// are.
export function isStale(
	template: GameQuestionTemplate,
	keyRest: string[],
	starters: StarterCandidate[],
	game: Pick<Game, "awayTeamId" | "homeTeamId">,
	isUnavailable: (playerId: string) => boolean,
): boolean {
	return match(template)
		.with({ shape: "player_stat_over_under" }, ({ pick }) => {
			const [teamId, playerId] = keyRest
			return (
				!!teamId &&
				!!playerId &&
				isRuledOut(starters, teamId, playerId, pick, isUnavailable)
			)
		})
		.with({ shape: "player_vs_player" }, ({ pick }) => {
			const [awayPlayerId, homePlayerId] = keyRest
			return (
				(!!awayPlayerId &&
					isRuledOut(
						starters,
						game.awayTeamId,
						awayPlayerId,
						pick,
						isUnavailable,
					)) ||
				(!!homePlayerId &&
					isRuledOut(
						starters,
						game.homeTeamId,
						homePlayerId,
						pick,
						isUnavailable,
					))
			)
		})
		.with(
			{ shape: "team_stat_numeric_guess" },
			{ shape: "team_stat_over_under" },
			{ shape: "game_total_over_under" },
			{ shape: "player_game_stat_leader" },
			() => false,
		)
		.exhaustive()
}

// The players a generated question is about, read off the rest of its key.
// A leader question's options are whole rosters, so it isn't about anyone in
// particular.
export function subjectPlayerIds(
	template: GameQuestionTemplate,
	keyRest: string[],
): string[] {
	return match(template)
		.returnType<string[]>()
		.with({ shape: "player_vs_player" }, () => keyRest.slice(0, 2))
		.with({ shape: "player_stat_over_under" }, () => keyRest.slice(1, 2))
		.with(
			{ shape: "team_stat_numeric_guess" },
			{ shape: "team_stat_over_under" },
			{ shape: "game_total_over_under" },
			{ shape: "player_game_stat_leader" },
			() => [],
		)
		.exhaustive()
}
