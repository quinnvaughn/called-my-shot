import {
	autoResolutionSource,
	type CreateQuestionInput,
} from "@called-my-shot/schemas"
import { isSeasonLongShape } from "@called-my-shot/scoring"
import { match } from "ts-pattern"
import type { Player, Team } from "../../db/schema"
import { ValidationError } from "../errors"
import { type OptionRow, playerOptions, teamOptions } from "./insert"

// The parsed createQuestion input.
export type CreateQuestionData = CreateQuestionInput

// The field errors more than one shape can raise, with the field each one
// points the form at.
export const SHAPE_FIELD_ERRORS = {
	pickGame: ["gameId", "Pick a game"],
	setLine: ["ouLine", "Set the line"],
	playerNotFound: ["subjectPlayerId", "Player not found"],
	teamNotFound: ["subjectTeamId", "Team not found"],
	sayAggregation: [
		"statAggregation",
		"Say whether that's a total or a per-game average",
	],
	pickTwoPlayers: ["options", "Pick two players"],
	pickTwoTeams: ["options", "Pick two teams"],
} as const satisfies Record<string, readonly [string, string]>

function fail(error: keyof typeof SHAPE_FIELD_ERRORS): never {
	const [field, message] = SHAPE_FIELD_ERRORS[error]
	throw ValidationError.field(field, message)
}

// Everything the shape checks and option rows read beyond the input itself,
// looked up by the caller. Each is null when the input didn't ask for it (or
// it wasn't found).
export type ShapeContext = {
	game: {
		homeTeamId: string
		awayTeamId: string
		homeTeamName: string
		awayTeamName: string
	} | null
	stat: { name: string; appliesTo: "player" | "team" | "both" } | null
	subjectPlayer: object | null
	subjectTeam: object | null
	// player_season_award/team_season_award: the league pool, narrowed by the
	// award's scoping fields.
	awardPlayerPool: Player[] | null
	awardTeamPool: Team[] | null
	// player_game_stat_leader: the active rosters of the game's two teams.
	gameLeaderPool: Player[] | null
	// player_team_season_stat_leader: the subject team's roster.
	teamLeaderPool: Player[] | null
}

// Checks the structured fields each shape needs. createQuestionSchema has
// already checked what it can see on its own; these are the checks that need
// the looked-up rows in ShapeContext. The title isn't checked here: it's
// always the creator's own text.
export function validateShapeFields(
	data: CreateQuestionData,
	ctx: ShapeContext,
): void {
	const { stat } = ctx
	// Only meaningful for a catalog stat - a freeform customStat (over_under
	// and player_vs_player both allow one, see requireStat vs
	// requireCatalogStat in the shared schema) has no appliesTo to check
	// against, so it's left alone rather than rejected.
	const requireStatAppliesTo = (kind: "player" | "team") => {
		if (stat && stat.appliesTo !== "both" && stat.appliesTo !== kind) {
			throw ValidationError.field(
				"statId",
				`"${stat.name}" isn't tracked as a ${kind} stat`,
			)
		}
	}
	const requirePlayer = () => {
		if (!ctx.subjectPlayer) fail("playerNotFound")
	}
	const requireTeam = () => {
		if (!ctx.subjectTeam) fail("teamNotFound")
	}
	// The game row itself, for the shapes whose options or title come off it.
	const requireGame = () => {
		if (!ctx.game) fail("pickGame")
	}
	// Just the id, for the shapes that only need to be tied to a game.
	const requireGameId = () => {
		if (!data.gameId) fail("pickGame")
	}
	const requireLine = () => {
		if (data.ouLine === undefined) fail("setLine")
	}
	const requireAggregation = () => {
		if (!data.statAggregation) fail("sayAggregation")
	}
	const requireTwoOptions = (error: "pickTwoPlayers" | "pickTwoTeams") => {
		const [a, b] = data.options ?? []
		if (!a?.label || !b?.label) fail(error)
	}

	match(data.shape)
		.with("player_stat_over_under", () => {
			requirePlayer()
			requireGameId()
			requireLine()
			requireStatAppliesTo("player")
		})
		.with("team_stat_over_under", () => {
			requireTeam()
			requireGameId()
			requireLine()
			requireStatAppliesTo("team")
		})
		.with("player_season_stat_over_under", () => {
			requirePlayer()
			requireLine()
			requireAggregation()
			requireStatAppliesTo("player")
		})
		.with("team_season_stat_over_under", () => {
			requireTeam()
			requireLine()
			requireAggregation()
			requireStatAppliesTo("team")
		})
		.with("game_total_over_under", () => {
			requireGame()
			requireLine()
			// A game-wide total is never about one specific player, same
			// subject kind as a team stat for this check's purposes.
			requireStatAppliesTo("team")
		})
		.with("player_stat_numeric_guess", () => {
			requirePlayer()
			requireGameId()
			requireStatAppliesTo("player")
		})
		.with("team_stat_numeric_guess", () => {
			requireTeam()
			requireGameId()
			requireStatAppliesTo("team")
		})
		.with("team_season_stat_numeric_guess", () => {
			requireTeam()
			requireStatAppliesTo("team")
		})
		.with("player_vs_player", () => {
			requireTwoOptions("pickTwoPlayers")
			requireGameId()
			requireStatAppliesTo("player")
		})
		.with("player_vs_player_season", () => {
			requireTwoOptions("pickTwoPlayers")
			requireAggregation()
			requireStatAppliesTo("player")
		})
		.with("team_vs_team_season", () => {
			requireTwoOptions("pickTwoTeams")
			requireAggregation()
			requireStatAppliesTo("team")
		})
		.with("team_vs_team", requireGame)
		// yes_no_prop and player_award_finalists have nothing left to check
		// here - createQuestionSchema's own superRefine (requireAwardName,
		// the eventClause check) already guarantees their required fields
		// by the time data exists.
		.with("yes_no_prop", () => {})
		.with("player_season_award", () => {
			if (
				!ctx.awardPlayerPool ||
				ctx.awardPlayerPool.length < (data.picksRequired ?? 1)
			) {
				throw ValidationError.field(
					"awardConferences",
					"No players match that conference/division/position - check the values",
				)
			}
		})
		.with("team_season_award", () => {
			if (
				!ctx.awardTeamPool ||
				ctx.awardTeamPool.length < (data.picksRequired ?? 1)
			) {
				throw ValidationError.field(
					"awardConferences",
					"No teams match that conference/division - check the values",
				)
			}
		})
		.with("player_award_finalists", () => {})
		.with("player_game_stat_leader", () => {
			requireGame()
			requireStatAppliesTo("player")
			if (!ctx.gameLeaderPool || ctx.gameLeaderPool.length < 2) {
				throw ValidationError.field(
					"statId",
					"Not enough players on either roster for this game yet",
				)
			}
		})
		// No pool check to mirror the game-scoped arm above - this pool is
		// the creator's own curated list, already size- and
		// playerId-validated by createQuestionSchema's requirePool, not
		// something derived here that could come back empty. No
		// statAggregation check either: it is genuinely optional on this
		// shape (see its arm in createQuestionSchema).
		.with("player_season_stat_leader", () => {
			requireStatAppliesTo("player")
		})
		.with("player_team_season_stat_leader", () => {
			requireTeam()
			requireStatAppliesTo("player")
			if (!ctx.teamLeaderPool || ctx.teamLeaderPool.length < 2) {
				throw ValidationError.field(
					"subjectTeamId",
					"Not enough players on that team's roster yet",
				)
			}
		})
		.exhaustive()
}

// The option rows a new question starts with, in display order. Expects
// validateShapeFields to have passed.
export function optionsFor(
	data: CreateQuestionData,
	ctx: ShapeContext,
): OptionRow[] {
	return (
		match(data.shape)
			.returnType<OptionRow[]>()
			.with(
				"player_vs_player",
				"player_vs_player_season",
				"team_vs_team_season",
				"player_award_finalists",
				"player_season_stat_leader",
				() =>
					(data.options ?? []).map((option) => ({
						label: option.label,
						teamId: option.teamId ?? null,
						playerId: option.playerId ?? null,
					})),
			)
			.with("player_season_award", () =>
				playerOptions(ctx.awardPlayerPool ?? []),
			)
			.with("team_season_award", () => teamOptions(ctx.awardTeamPool ?? []))
			.with("player_game_stat_leader", () =>
				playerOptions(ctx.gameLeaderPool ?? []),
			)
			.with("player_team_season_stat_leader", () =>
				playerOptions(ctx.teamLeaderPool ?? []),
			)
			.with("yes_no_prop", () => [{ label: "Yes" }, { label: "No" }])
			// Bare "Over"/"Under" - the line itself isn't part of the stored label,
			// it's appended for display by optionDisplayLabel (web) wherever an
			// over/under option renders. Baking ouLine in here too would double it
			// up on every render.
			.with(
				"player_stat_over_under",
				"team_stat_over_under",
				"player_season_stat_over_under",
				"team_season_stat_over_under",
				"game_total_over_under",
				() => [{ label: "Over" }, { label: "Under" }],
			)
			.with("team_vs_team", () => {
				const { game } = ctx
				if (!game) fail("pickGame")
				return [
					{ label: game.awayTeamName, teamId: game.awayTeamId },
					{ label: game.homeTeamName, teamId: game.homeTeamId },
				]
			})
			// Scored via calls.guessValue directly, no options at all.
			.with(
				"player_stat_numeric_guess",
				"team_stat_numeric_guess",
				"team_season_stat_numeric_guess",
				() => [],
			)
			.exhaustive()
	)
}

// A system question settles from ESPN, so ESPN's source is stored in place of
// the creator's - see resolutionModeFor.
export function storedResolutionSource(
	data: Pick<CreateQuestionData, "shape" | "resolutionSource">,
	resolutionMode: "manual" | "system",
): string {
	if (resolutionMode === "manual") return data.resolutionSource
	return autoResolutionSource(
		data.shape === "team_season_award"
			? "postseason"
			: isSeasonLongShape(data.shape)
				? "season"
				: "game",
	)
}
