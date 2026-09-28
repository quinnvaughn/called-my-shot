import { describe, expect, it } from "vitest"
import {
	castCallSchema,
	createQuestionSchema,
	fileDisputeSchema,
	isAdminOnlyShape,
	type QuestionShape,
	questionShapeSchema,
	resolutionSourceUrlSchema,
	resolveQuestionSchema,
} from "./questions"

const UUIDS = Array.from(
	{ length: 8 },
	(_, i) => `00000000-0000-4000-8000-00000000000${i}`,
)
const [SPORT, LEAGUE, GAME, STAT, PLAYER_A, PLAYER_B, TEAM_A, TEAM_B] = UUIDS

// Far enough out that the "lock time must be in the future" refine can never
// go stale mid-run.
const FUTURE = new Date(Date.now() + 86_400_000).toISOString()

function base(overrides: Record<string, unknown> = {}) {
	return {
		title: "Will it happen?",
		sportId: SPORT,
		leagueId: LEAGUE,
		resolutionSource: "Box score",
		locksAt: FUTURE,
		...overrides,
	}
}

/** The field paths a failed parse complained about, deduped. */
function errorPaths(input: unknown): string[] {
	const result = createQuestionSchema.safeParse(input)
	if (result.success) return []
	return [...new Set(result.error.issues.map((i) => i.path.join(".")))]
}

function expectValid(input: unknown) {
	const result = createQuestionSchema.safeParse(input)
	if (!result.success) {
		throw new Error(
			`expected valid, got issues: ${JSON.stringify(result.error.issues, null, 2)}`,
		)
	}
	return result.data
}

describe("questionShapeSchema", () => {
	it("accepts every shape the app supports and nothing else", () => {
		expect(questionShapeSchema.options).toHaveLength(19)
		expect(questionShapeSchema.safeParse("yes_no_prop").success).toBe(true)
		expect(questionShapeSchema.safeParse("YES_NO_PROP").success).toBe(false)
		expect(questionShapeSchema.safeParse("made_up_shape").success).toBe(false)
	})
})

describe("resolutionSourceUrlSchema", () => {
	it("keeps an empty value empty - the field is optional", () => {
		expect(resolutionSourceUrlSchema.parse("")).toBe("")
		expect(resolutionSourceUrlSchema.parse("   ")).toBe("")
	})

	it("adds https:// to the scheme-less form people actually paste", () => {
		expect(resolutionSourceUrlSchema.parse("databallr.com/stats")).toBe(
			"https://databallr.com/stats",
		)
		expect(resolutionSourceUrlSchema.parse("//databallr.com")).toBe(
			"https://databallr.com",
		)
	})

	it("leaves an explicit http/https URL alone", () => {
		expect(resolutionSourceUrlSchema.parse("http://espn.com/x")).toBe(
			"http://espn.com/x",
		)
	})

	it("rejects non-http schemes - the value renders as a clickable link", () => {
		expect(
			resolutionSourceUrlSchema.safeParse("javascript:alert(1)").success,
		).toBe(false)
		expect(
			resolutionSourceUrlSchema.safeParse("data:text/html,<script>").success,
		).toBe(false)
		expect(resolutionSourceUrlSchema.safeParse("ftp://espn.com").success).toBe(
			false,
		)
	})

	it("rejects a host that isn't dotted, so a typo can't become a dead link", () => {
		expect(resolutionSourceUrlSchema.safeParse("notaurl").success).toBe(false)
		expect(
			resolutionSourceUrlSchema.safeParse("http://localhost").success,
		).toBe(false)
	})
})

describe("createQuestionSchema - fields every shape shares", () => {
	const valid = base({
		shape: "yes_no_prop",
		eventClause: "signs an extension",
	})

	it("accepts a minimal valid question", () => {
		expect(expectValid(valid).title).toBe("Will it happen?")
	})

	it("requires a title, sport and league", () => {
		expect(errorPaths({ ...valid, title: "  " })).toContain("title")
		expect(errorPaths({ ...valid, sportId: "nope" })).toContain("sportId")
		expect(errorPaths({ ...valid, leagueId: undefined })).toContain("leagueId")
	})

	it("requires a lock time in the future", () => {
		expect(errorPaths({ ...valid, locksAt: "not a date" })).toContain("locksAt")
		expect(
			errorPaths({
				...valid,
				locksAt: new Date(Date.now() - 1000).toISOString(),
			}),
		).toContain("locksAt")
	})

	it("defaults the optional text and array fields", () => {
		const parsed = expectValid(valid)
		expect(parsed.options).toEqual([])
		expect(parsed.customStat).toBe("")
		expect(parsed.awardName).toBe("")
		expect(parsed.resolutionSourceUrl).toBe("")
		expect(parsed.awardConferences).toEqual([])
		expect(parsed.awardRookieOnly).toBe(false)
	})
})

describe("createQuestionSchema - admin-only shapes", () => {
	it.each([
		"player_season_award",
		"team_season_award",
		"player_award_finalists",
		"team_vs_team",
	] as QuestionShape[])("%s must be posted as official", (shape) => {
		expect(errorPaths(base({ shape }))).toContain("isOfficial")
	})

	it("lets a normal shape be posted unofficially", () => {
		expect(
			errorPaths(base({ shape: "yes_no_prop", eventClause: "wins MVP" })),
		).not.toContain("isOfficial")
	})

	// isAdminOnlyShape is what the create form reads to hide these from a
	// non-admin's picker and force the Official toggle on. It has to agree with
	// the superRefine above for every shape, not just the ones spelled out in
	// the case list - a hand-copied list in the web app had already drifted from
	// this rule by omitting team_vs_team, which left the toggle enabled for a
	// shape that can only be posted official and silently disabled Publish.
	it.each(questionShapeSchema.options)(
		"isAdminOnlyShape agrees with the schema's own rule for %s",
		(shape) => {
			const flaggedByRule = errorPaths(base({ shape })).includes("isOfficial")
			expect(isAdminOnlyShape(shape)).toBe(flaggedByRule)
		},
	)

	it("requires a ballot question to be official too", () => {
		const paths = errorPaths(
			base({
				shape: "yes_no_prop",
				eventClause: "wins MVP",
				ballot: { ballotId: GAME, label: "Position 1" },
			}),
		)
		expect(paths).toContain("isOfficial")
	})
})

describe("createQuestionSchema - over/under shapes", () => {
	const ou = base({
		shape: "player_stat_over_under",
		subjectPlayerId: PLAYER_A,
		gameId: GAME,
		statId: STAT,
		ouLine: 24.5,
	})

	it("accepts a well-formed line", () => {
		expect(expectValid(ou).ouLine).toBe(24.5)
	})

	it("requires a subject, a game, a stat and a line", () => {
		expect(errorPaths({ ...ou, subjectPlayerId: undefined })).toContain(
			"subjectPlayerId",
		)
		expect(errorPaths({ ...ou, gameId: undefined })).toContain("gameId")
		expect(errorPaths({ ...ou, ouLine: undefined })).toContain("ouLine")
		expect(
			errorPaths({ ...ou, statId: undefined, customStat: "  " }),
		).toContain("customStat")
	})

	it("rejects a whole-number line - the result could land exactly on it", () => {
		// Neither Over nor Under would be correct on a result that lands on it.
		expect(errorPaths({ ...ou, ouLine: 24 })).toContain("ouLine")
		expect(errorPaths({ ...ou, ouLine: 0 })).toContain("ouLine")
		expect(errorPaths({ ...ou, ouLine: -3 })).toContain("ouLine")
	})

	it("accepts a freeform stat when no catalog stat is picked", () => {
		expectValid({ ...ou, statId: undefined, customStat: "RAPM" })
	})

	it("wants a team subject for the team variant", () => {
		const teamOu = {
			...ou,
			shape: "team_stat_over_under",
			subjectPlayerId: undefined,
		}
		expect(errorPaths(teamOu)).toContain("subjectTeamId")
		expectValid({ ...teamOu, subjectTeamId: TEAM_A })
	})

	it("requires an aggregation on the season variants but no game", () => {
		const seasonOu = {
			...ou,
			shape: "player_season_stat_over_under",
			gameId: undefined,
		}
		expect(errorPaths(seasonOu)).toContain("statAggregation")
		expect(errorPaths(seasonOu)).not.toContain("gameId")
		expectValid({ ...seasonOu, statAggregation: "total" })
	})

	it("needs no subject at all for a game total", () => {
		expectValid(
			base({
				shape: "game_total_over_under",
				gameId: GAME,
				statId: STAT,
				ouLine: 220.5,
			}),
		)
	})
})

describe("createQuestionSchema - numeric guess shapes", () => {
	const guess = base({
		shape: "player_stat_numeric_guess",
		subjectPlayerId: PLAYER_A,
		gameId: GAME,
		statId: STAT,
	})

	it("accepts a catalog stat", () => {
		expectValid(guess)
	})

	it("refuses a freeform stat - there'd be no tolerance tier to read", () => {
		expect(
			errorPaths({ ...guess, statId: undefined, customStat: "RAPM" }),
		).toContain("statId")
	})

	it("takes no game on the season-scoped variant", () => {
		const seasonGuess = base({
			shape: "team_season_stat_numeric_guess",
			subjectTeamId: TEAM_A,
			statId: STAT,
		})
		expectValid(seasonGuess)
		expect(errorPaths({ ...seasonGuess, subjectTeamId: undefined })).toContain(
			"subjectTeamId",
		)
	})
})

describe("createQuestionSchema - head-to-head shapes", () => {
	const pvpOptions = [
		{ label: "A", playerId: PLAYER_A },
		{ label: "B", playerId: PLAYER_B },
	]
	const pvp = base({
		shape: "player_vs_player",
		gameId: GAME,
		statId: STAT,
		options: pvpOptions,
	})

	it("accepts exactly two distinct named sides", () => {
		expectValid(pvp)
	})

	it("rejects anything other than two sides", () => {
		expect(
			errorPaths({ ...pvp, options: [{ label: "A", playerId: PLAYER_A }] }),
		).toContain("options")
		expect(
			errorPaths({
				...pvp,
				options: [...pvpOptions, { label: "C", playerId: TEAM_A }],
			}),
		).toContain("options")
	})

	it("rejects the same side twice - that isn't a matchup", () => {
		expect(
			errorPaths({
				...pvp,
				options: [
					{ label: "A", playerId: PLAYER_A },
					{ label: "A again", playerId: PLAYER_A },
				],
			}),
		).toContain("options.1.label")
	})

	it("rejects a freeform side with no real player behind it", () => {
		expect(
			errorPaths({
				...pvp,
				options: [{ label: "A", playerId: PLAYER_A }, { label: "Someone" }],
			}),
		).toContain("options.1.label")
	})

	it("requires an aggregation on the season variant, and no game", () => {
		const seasonPvp = {
			...pvp,
			shape: "player_vs_player_season",
			gameId: undefined,
		}
		expect(errorPaths(seasonPvp)).toContain("statAggregation")
		expectValid({ ...seasonPvp, statAggregation: "per_game" })
	})

	it("checks team sides for the team season head-to-head", () => {
		const tvt = base({
			shape: "team_vs_team_season",
			statId: STAT,
			statAggregation: "total",
			options: [
				{ label: "A", teamId: TEAM_A },
				{ label: "B", teamId: TEAM_B },
			],
		})
		expectValid(tvt)
		expect(
			errorPaths({
				...tvt,
				options: [
					{ label: "A", teamId: TEAM_A },
					{ label: "B", teamId: TEAM_A },
				],
			}),
		).toContain("options.1.label")
	})

	it("derives team_vs_team's sides from the game, so it submits no options", () => {
		expectValid(base({ shape: "team_vs_team", gameId: GAME, isOfficial: true }))
		expect(
			errorPaths(base({ shape: "team_vs_team", isOfficial: true })),
		).toContain("gameId")
	})
})

describe("createQuestionSchema - yes/no props", () => {
	const prop = base({ shape: "yes_no_prop", eventClause: "signs an extension" })

	it("requires the proposition text", () => {
		expect(errorPaths({ ...prop, eventClause: "   " })).toContain("eventClause")
	})

	it("allows no subject, or exactly one", () => {
		expectValid(prop)
		expectValid({ ...prop, subjectPlayerId: PLAYER_A })
		expectValid({ ...prop, subjectTeamId: TEAM_A })
	})

	it("rejects both a player and a team subject", () => {
		expect(
			errorPaths({ ...prop, subjectPlayerId: PLAYER_A, subjectTeamId: TEAM_A }),
		).toContain("subjectPlayerId")
	})
})

describe("createQuestionSchema - award shapes", () => {
	const award = base({
		shape: "player_season_award",
		isOfficial: true,
		awardName: "MVP",
		awardVerb: "win",
		picksRequired: 1,
		options: [{ label: "A", playerId: PLAYER_A }],
	})

	it("accepts a single-winner race", () => {
		expectValid(award)
	})

	it("requires a name and a verb", () => {
		expect(errorPaths({ ...award, awardName: " " })).toContain("awardName")
		expect(errorPaths({ ...award, awardVerb: undefined })).toContain(
			"awardVerb",
		)
	})

	it("requires at least one pick", () => {
		expect(errorPaths({ ...award, picksRequired: 0 })).toContain(
			"picksRequired",
		)
	})

	it("requires the pool to be at least as big as picksRequired", () => {
		expect(errorPaths({ ...award, picksRequired: 5 })).toContain("options")
		expectValid({
			...award,
			picksRequired: 2,
			options: [
				{ label: "A", playerId: PLAYER_A },
				{ label: "B", playerId: PLAYER_B },
			],
		})
	})

	it("requires every pool entry to be a real player", () => {
		expect(errorPaths({ ...award, options: [{ label: "Someone" }] })).toContain(
			"options.0.label",
		)
	})

	it("refuses a division filter without a conference", () => {
		// "South" repeats across conferences, so a bare division is ambiguous.
		expect(errorPaths({ ...award, awardDivisions: ["South"] })).toContain(
			"awardConferences",
		)
		expectValid({
			...award,
			awardConferences: ["AL"],
			awardDivisions: ["East"],
		})
	})

	it("checks team pools for the team award", () => {
		const teamAward = {
			...award,
			shape: "team_season_award",
			options: [{ label: "A", teamId: TEAM_A }],
		}
		expectValid(teamAward)
		expect(
			errorPaths({
				...teamAward,
				options: [{ label: "A", playerId: PLAYER_A }],
			}),
		).toContain("options.0.label")
	})

	it("wants at least two finalists and no verb", () => {
		const finalists = base({
			shape: "player_award_finalists",
			isOfficial: true,
			awardName: "MVP",
			options: [
				{ label: "A", playerId: PLAYER_A },
				{ label: "B", playerId: PLAYER_B },
			],
		})
		expectValid(finalists)
		expect(
			errorPaths({
				...finalists,
				options: [{ label: "A", playerId: PLAYER_A }],
			}),
		).toContain("options")
	})
})

describe("createQuestionSchema - stat-leader shapes", () => {
	it("takes a game, a catalog stat and a 2+ pool for the game-scoped leader", () => {
		const leader = base({
			shape: "player_game_stat_leader",
			gameId: GAME,
			statId: STAT,
			options: [
				{ label: "A", playerId: PLAYER_A },
				{ label: "B", playerId: PLAYER_B },
			],
		})
		expectValid(leader)
		expect(
			errorPaths({ ...leader, statId: undefined, customStat: "EPA" }),
		).toContain("statId")
		expect(
			errorPaths({ ...leader, options: [{ label: "A", playerId: PLAYER_A }] }),
		).toContain("options")
	})

	it("needs 3+ for the season leader - a 2-name pool is a head-to-head", () => {
		const twoPlayers = [
			{ label: "A", playerId: PLAYER_A },
			{ label: "B", playerId: PLAYER_B },
		]
		const seasonLeader = base({
			shape: "player_season_stat_leader",
			customStat: "RAPM",
			options: twoPlayers,
		})
		expect(errorPaths(seasonLeader)).toContain("options")
		expectValid({
			...seasonLeader,
			options: [...twoPlayers, { label: "C", playerId: TEAM_A }],
		})
	})

	it("allows a freeform stat and needs no aggregation on the season leader", () => {
		// The advanced full-season metrics this shape exists for aren't in the
		// catalog, and an aggregation word would only mislead the title.
		const parsed = expectValid(
			base({
				shape: "player_season_stat_leader",
				customStat: "RAPM",
				options: [
					{ label: "A", playerId: PLAYER_A },
					{ label: "B", playerId: PLAYER_B },
					{ label: "C", playerId: TEAM_A },
				],
			}),
		)
		expect(parsed.statAggregation).toBeUndefined()
	})

	it("takes a team and a stat for the team leader, and no pool", () => {
		const teamLeader = base({
			shape: "player_team_season_stat_leader",
			subjectTeamId: TEAM_A,
			statId: STAT,
		})
		expectValid(teamLeader)
		expectValid({ ...teamLeader, statId: undefined, customStat: "Deflections" })
		expect(errorPaths({ ...teamLeader, subjectTeamId: undefined })).toContain(
			"subjectTeamId",
		)
		expect(errorPaths({ ...teamLeader, statId: undefined })).toContain(
			"customStat",
		)
	})
})

describe("castCallSchema", () => {
	const call = { questionId: GAME, shape: "yes_no_prop" as const }

	it("requires exactly one selection for a single-pick shape", () => {
		const one = castCallSchema.safeParse({
			...call,
			selections: [{ optionId: PLAYER_A, conviction: 50 }],
		})
		expect(one.success).toBe(true)
		expect(castCallSchema.safeParse({ ...call, selections: [] }).success).toBe(
			false,
		)
		expect(
			castCallSchema.safeParse({
				...call,
				selections: [
					{ optionId: PLAYER_A, conviction: 50 },
					{ optionId: PLAYER_B, conviction: 50 },
				],
			}).success,
		).toBe(false)
	})

	it("allows several selections on the award shapes", () => {
		const result = castCallSchema.safeParse({
			questionId: GAME,
			shape: "player_season_award",
			selections: [
				{ optionId: PLAYER_A, conviction: 50 },
				{ optionId: PLAYER_B, conviction: 80 },
			],
		})
		expect(result.success).toBe(true)
	})

	it("requires a guess and a conviction on the numeric shapes", () => {
		const numeric = {
			questionId: GAME,
			shape: "player_stat_numeric_guess" as const,
		}
		expect(castCallSchema.safeParse(numeric).success).toBe(false)
		expect(
			castCallSchema.safeParse({ ...numeric, guessValue: 20 }).success,
		).toBe(false)
		expect(
			castCallSchema.safeParse({ ...numeric, guessValue: 20, conviction: 60 })
				.success,
		).toBe(true)
	})

	it("rejects NaN as a guess", () => {
		expect(
			castCallSchema.safeParse({
				questionId: GAME,
				shape: "team_stat_numeric_guess",
				guessValue: Number.NaN,
				conviction: 60,
			}).success,
		).toBe(false)
	})

	it("bounds conviction to 1-100 and requires a whole number", () => {
		const withConviction = (conviction: number) =>
			castCallSchema.safeParse({
				...call,
				selections: [{ optionId: PLAYER_A, conviction }],
			}).success
		expect(withConviction(1)).toBe(true)
		expect(withConviction(100)).toBe(true)
		expect(withConviction(0)).toBe(false)
		expect(withConviction(101)).toBe(false)
		expect(withConviction(50.5)).toBe(false)
	})

	it("caps the case text and defaults it to empty", () => {
		const parsed = castCallSchema.safeParse({
			...call,
			selections: [{ optionId: PLAYER_A, conviction: 50 }],
		})
		expect(parsed.success && parsed.data.caseText).toBe("")
		expect(
			castCallSchema.safeParse({
				...call,
				caseText: "x".repeat(601),
				selections: [{ optionId: PLAYER_A, conviction: 50 }],
			}).success,
		).toBe(false)
	})
})

describe("resolveQuestionSchema", () => {
	it("requires exactly one correct option on single-outcome shapes", () => {
		const single = { shape: "yes_no_prop" as const }
		expect(
			resolveQuestionSchema.safeParse({
				...single,
				correctOptionIds: [PLAYER_A],
			}).success,
		).toBe(true)
		expect(
			resolveQuestionSchema.safeParse({ ...single, correctOptionIds: [] })
				.success,
		).toBe(false)
		expect(
			resolveQuestionSchema.safeParse({
				...single,
				correctOptionIds: [PLAYER_A, PLAYER_B],
			}).success,
		).toBe(false)
	})

	it("allows a tie on the award and leader shapes", () => {
		// A real-world tie for "most points in this game" is as valid an
		// outcome as a tie for an award race.
		for (const shape of [
			"player_season_award",
			"team_season_award",
			"player_game_stat_leader",
			"player_season_stat_leader",
		] as const) {
			expect(
				resolveQuestionSchema.safeParse({
					shape,
					correctOptionIds: [PLAYER_A, PLAYER_B],
				}).success,
				shape,
			).toBe(true)
		}
	})

	it("accepts fewer winners than picksRequired on an award", () => {
		expect(
			resolveQuestionSchema.safeParse({
				shape: "player_season_award",
				correctOptionIds: [PLAYER_A],
			}).success,
		).toBe(true)
	})

	it("requires at least one winner on the award shapes", () => {
		expect(
			resolveQuestionSchema.safeParse({
				shape: "player_season_award",
				correctOptionIds: [],
			}).success,
		).toBe(false)
	})

	it("requires an actual value on the numeric shapes", () => {
		expect(
			resolveQuestionSchema.safeParse({ shape: "player_stat_numeric_guess" })
				.success,
		).toBe(false)
		expect(
			resolveQuestionSchema.safeParse({
				shape: "player_stat_numeric_guess",
				actualValue: 0,
			}).success,
		).toBe(true)
		expect(
			resolveQuestionSchema.safeParse({
				shape: "player_stat_numeric_guess",
				actualValue: Number.NaN,
			}).success,
		).toBe(false)
	})

	it("caps the resolution note", () => {
		expect(
			resolveQuestionSchema.safeParse({
				shape: "yes_no_prop",
				correctOptionIds: [PLAYER_A],
				resolutionNote: "x".repeat(501),
			}).success,
		).toBe(false)
	})
})

describe("fileDisputeSchema", () => {
	it("requires a reason within length bounds", () => {
		expect(
			fileDisputeSchema.safeParse({ questionId: GAME, reason: "wrong" })
				.success,
		).toBe(true)
		expect(
			fileDisputeSchema.safeParse({ questionId: GAME, reason: "   " }).success,
		).toBe(false)
		expect(
			fileDisputeSchema.safeParse({ questionId: GAME, reason: "x".repeat(501) })
				.success,
		).toBe(false)
	})
})
