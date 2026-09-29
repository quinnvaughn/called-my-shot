import type { AutoResolveStatKey } from "@called-my-shot/schemas"
import type { AutoResolveFailure } from "../../db/schema"
import {
	type ParsedAthlete,
	type ParsedBoxScore,
	parseInnings,
	parseMadeAttempted,
	parseStatNumber,
	roundToThousandths,
} from "../../db/sync/box-score-parse"

// What one stat reads as for one player or team, over one game or one season.
export type StatReading =
	| { kind: "value"; value: number }
	| { kind: "did_not_play" }
	| { kind: "unavailable"; reason: AutoResolveFailure; detail: string }

// Everything fetched for one game. The two maps beyond the box score are only
// filled when an extractor on one of that game's questions says it needs them.
export type GameSources = {
	box: ParsedBoxScore
	// espnTeamId -> espnAthleteId -> whether ESPN lists them as not having played
	didNotPlayByTeam: Map<string, Map<string, boolean>>
	// espnAthleteId -> "category.stat" -> game value
	athleteGameStats: Map<string, Map<string, number>>
}

export type GameSourceNeed = "roster" | "athleteGameStats"

// Which map in ParsedBoxScore a value is read out of, and under which raw ESPN
// keys. "athlete" is ParsedAthlete.stats, "team_box" is teamStats, and
// "player_table_total" is tableTotals - three separate key namespaces that
// must not be conflated (NBA team rebounds are "totalRebounds" in the team box
// but "rebounds" in the player tables). Nearly every stat is one key; a stat
// made of several (NFL rushing + receiving yards) is their sum, each read with
// the same parser.
export type BoxStatSource = {
	origin: "athlete" | "team_box" | "player_table_total" | "final_score"
	keys: readonly string[]
	parse: (raw: string | undefined) => number | null
}

export type GamePlayerExtractor = {
	scope: "game"
	subject: "player"
	needs: readonly GameSourceNeed[]
	read: (sources: GameSources, espnAthleteId: string) => StatReading
	// Every athlete in the game with a value, for "who led the game" questions.
	// Absent for a stat that can't settle one (see AUTO_RESOLVE_STATS).
	readAll?: (sources: GameSources) => Map<string, number>
	// Where this stat lives in a stored box score, when it is a cell read
	// straight off one, or several cells added up. Absent means the value can't be recovered from
	// stored box-score rows alone, which is the signal stat context uses to
	// leave the stat out rather than read a cell that doesn't mean what its
	// key suggests. Three reasons it's absent: the value is computed from
	// several cells (mlbPitchingRate), it isn't a stat cell at all (teamScore,
	// mlbSaves), or the box score's column for it is season-to-date rather
	// than per-game (mlbBatterGameStat - see its comment).
	source?: BoxStatSource
}

export type GameTeamExtractor = {
	scope: "game"
	subject: "team"
	needs: readonly GameSourceNeed[]
	read: (sources: GameSources, espnTeamId: string) => StatReading
	// See GamePlayerExtractor.source.
	source?: BoxStatSource
}

export type GameExtractor = GamePlayerExtractor | GameTeamExtractor

// Everything fetched for one league's regular season.
export type SeasonSources = {
	// espnAthleteId -> "category.stat" -> season value. An athlete ESPN has no
	// season for at all maps to an empty map, which reads as never having played.
	athleteStats: Map<string, Map<string, number>>
	// espnTeamId -> "category.stat" -> season value
	teamStats: Map<string, Map<string, number>>
	// espnTeamId -> regular-season wins, or null when the standings couldn't be
	// read.
	winsByTeam: Map<string, number> | null
}

export type SeasonSourceNeed = "athleteStats" | "teamStats" | "standings"

export type SeasonAggregation = "total" | "per_game"

export type SeasonExtractor = {
	scope: "season"
	subject: "player" | "team"
	needs: readonly SeasonSourceNeed[]
	read: (
		sources: SeasonSources,
		espnId: string,
		aggregation: SeasonAggregation,
	) => StatReading
}

export type Extractor = GameExtractor | SeasonExtractor

const value = (v: number): StatReading => ({ kind: "value", value: v })
const DID_NOT_PLAY: StatReading = { kind: "did_not_play" }

const notInBoxScore = (espnAthleteId: string): StatReading => ({
	kind: "unavailable",
	reason: "subject_not_in_box_score",
	detail: `ESPN athlete ${espnAthleteId} isn't in the box score`,
})

const noValue = (what: string): StatReading => ({
	kind: "unavailable",
	reason: "subject_not_in_box_score",
	detail: `no ${what} value in the box score`,
})

function collect(
	box: ParsedBoxScore,
	key: string,
	parse: (raw: string | undefined) => number | null,
	include: (athlete: ParsedAthlete) => boolean,
): Map<string, number> {
	const values = new Map<string, number>()
	for (const [id, athlete] of box.athletes) {
		if (!include(athlete)) continue
		const v = parse(athlete.stats.get(key))
		if (v !== null) values.set(id, v)
	}
	return values
}

// NBA lists everyone dressed for the game, with didNotPlay on anyone who sat,
// so an athlete missing from the box score entirely wasn't with either team.
function nbaPlayer(
	key: string,
	parse: (raw: string | undefined) => number | null = parseStatNumber,
): GamePlayerExtractor {
	return {
		scope: "game",
		subject: "player",
		needs: [],
		read: ({ box }, espnAthleteId) => {
			const athlete = box.athletes.get(espnAthleteId)
			if (!athlete) return notInBoxScore(espnAthleteId)
			if (athlete.didNotPlay) return DID_NOT_PLAY
			const v = parse(athlete.stats.get(key))
			return v === null ? noValue(key) : value(v)
		},
		readAll: ({ box }) => collect(box, key, parse, (a) => !a.didNotPlay),
		source: { origin: "athlete", keys: [key], parse },
	}
}

// NFL only lists a player under the tables they recorded something in, so
// being absent means "played, recorded none" or "didn't play". The game
// roster's didNotPlay is what tells those apart. Several keys are one stat
// added up, each missing one counting as zero: a back with carries and no
// catches has no receiving line at all.
function nflPlayer(...keys: string[]): GamePlayerExtractor {
	const sum = (athlete: ParsedAthlete | undefined) =>
		keys.reduce(
			(total, key) => total + (parseStatNumber(athlete?.stats.get(key)) ?? 0),
			0,
		)
	return {
		scope: "game",
		subject: "player",
		needs: ["roster"],
		read: ({ box, didNotPlayByTeam }, espnAthleteId) => {
			const roster = [...didNotPlayByTeam.values()].find((r) =>
				r.has(espnAthleteId),
			)
			if (!roster) return notInBoxScore(espnAthleteId)
			if (roster.get(espnAthleteId)) return DID_NOT_PLAY
			return value(sum(box.athletes.get(espnAthleteId)))
		},
		readAll: ({ box }) =>
			new Map(
				[...box.athletes]
					.filter(([, a]) =>
						keys.some((key) => parseStatNumber(a.stats.get(key)) !== null),
					)
					.map(([id, a]) => [id, sum(a)]),
			),
		source: { origin: "athlete", keys, parse: parseStatNumber },
	}
}

// MLB lists every batter who came to the plate and every pitcher who pitched,
// so an athlete without a row in that table didn't appear in that role.
function appearedIn(
	athlete: ParsedAthlete | undefined,
	table: "batting" | "pitching",
): athlete is ParsedAthlete {
	if (!athlete) return false
	return [...athlete.stats.keys()].some((k) => k.startsWith(`${table}.`))
}

function mlbCounting(
	table: "batting" | "pitching",
	key: string,
): GamePlayerExtractor {
	const statKey = `${table}.${key}`
	return {
		scope: "game",
		subject: "player",
		needs: [],
		read: ({ box }, espnAthleteId) => {
			const athlete = box.athletes.get(espnAthleteId)
			if (!appearedIn(athlete, table)) return DID_NOT_PLAY
			const v = parseStatNumber(athlete.stats.get(statKey))
			return v === null ? noValue(statKey) : value(v)
		},
		readAll: ({ box }) =>
			collect(box, statKey, parseStatNumber, (a) => appearedIn(a, table)),
		source: { origin: "athlete", keys: [statKey], parse: parseStatNumber },
	}
}

// The box score's ERA column is season-to-date, so a game ERA or WHIP is worked
// out from that game's own line.
function mlbPitchingRate(
	compute: (line: {
		innings: number
		hits: number
		walks: number
		earnedRuns: number
	}) => number,
): GamePlayerExtractor {
	return {
		scope: "game",
		subject: "player",
		needs: [],
		read: ({ box }, espnAthleteId) => {
			const athlete = box.athletes.get(espnAthleteId)
			if (!appearedIn(athlete, "pitching")) return DID_NOT_PLAY
			const innings = parseInnings(
				athlete.stats.get("pitching.fullInnings.partInnings"),
			)
			const hits = parseStatNumber(athlete.stats.get("pitching.hits"))
			const walks = parseStatNumber(athlete.stats.get("pitching.walks"))
			const earnedRuns = parseStatNumber(
				athlete.stats.get("pitching.earnedRuns"),
			)
			if (innings === null || hits === null || walks === null) {
				return noValue("pitching line")
			}
			if (earnedRuns === null) return noValue("earned runs")
			if (innings === 0) {
				return {
					kind: "unavailable",
					reason: "stat_undefined",
					detail: "no outs recorded, so the rate has no value",
				}
			}
			return value(
				roundToThousandths(compute({ innings, hits, walks, earnedRuns })),
			)
		},
	}
}

const SAVE_DECISION = /^S(,|$)/

const mlbSaves: GamePlayerExtractor = {
	scope: "game",
	subject: "player",
	needs: [],
	read: ({ box }, espnAthleteId) => {
		const athlete = box.athletes.get(espnAthleteId)
		if (!appearedIn(athlete, "pitching")) return DID_NOT_PLAY
		return value(savesFor(athlete))
	},
	readAll: ({ box }) =>
		new Map(
			[...box.athletes]
				.filter(([, a]) => appearedIn(a, "pitching"))
				.map(([id, a]) => [id, savesFor(a)]),
		),
}

function savesFor(athlete: ParsedAthlete): number {
	return athlete.notes.some(
		(n) => n.type === "pitchingDecision" && SAVE_DECISION.test(n.text),
	)
		? 1
		: 0
}

// Batting stats the box score either doesn't carry per player (stolen bases)
// or only carries season-to-date (the three rates), read from the athlete's
// own game statistics instead.
function mlbBatterGameStat(
	stat: "stolenBases" | "avg" | "onBasePct" | "slugAvg",
): GamePlayerExtractor {
	return {
		scope: "game",
		subject: "player",
		needs: ["athleteGameStats"],
		read: ({ box, athleteGameStats }, espnAthleteId) => {
			if (!appearedIn(box.athletes.get(espnAthleteId), "batting")) {
				return DID_NOT_PLAY
			}
			const stats = athleteGameStats.get(espnAthleteId)
			if (!stats) {
				return {
					kind: "unavailable",
					reason: "fetch_failed",
					detail: `no game statistics for ESPN athlete ${espnAthleteId}`,
				}
			}
			const atBats = stats.get("batting.atBats") ?? 0
			const plateAppearances =
				atBats +
				(stats.get("batting.walks") ?? 0) +
				(stats.get("batting.hitByPitch") ?? 0) +
				(stats.get("batting.sacFlies") ?? 0)
			const denominator = stat === "onBasePct" ? plateAppearances : atBats
			if (stat !== "stolenBases" && denominator === 0) {
				return {
					kind: "unavailable",
					reason: "stat_undefined",
					detail: "no at-bats, so the rate has no value",
				}
			}
			const v = stats.get(`batting.${stat}`)
			if (v === undefined) return noValue(`batting.${stat}`)
			return value(stat === "stolenBases" ? v : roundToThousandths(v))
		},
	}
}

const teamScore: GameTeamExtractor = {
	scope: "game",
	subject: "team",
	needs: [],
	read: ({ box }, espnTeamId) => {
		const score = box.scoreByEspnTeamId.get(espnTeamId)
		return score === undefined
			? noValue(`score for team ${espnTeamId}`)
			: value(score)
	},
	source: { origin: "final_score", keys: ["score"], parse: parseStatNumber },
}

function teamBoxStat(
	name: string,
	parse: (raw: string | undefined) => number | null = parseStatNumber,
): GameTeamExtractor {
	return {
		scope: "game",
		subject: "team",
		needs: [],
		read: ({ box }, espnTeamId) => {
			const v = parse(box.teamStats.get(espnTeamId)?.get(name))
			return v === null ? noValue(name) : value(v)
		},
		source: { origin: "team_box", keys: [name], parse },
	}
}

const parseRate = (raw: string | undefined) => {
	const v = parseStatNumber(raw)
	return v === null ? null : roundToThousandths(v)
}

// Team stats the team box doesn't carry, read off the player tables' totals
// row instead. A table nobody recorded a line in has no totals, which is a
// genuine zero.
function teamTableTotal(key: string): GameTeamExtractor {
	return {
		scope: "game",
		subject: "team",
		needs: [],
		read: ({ box }, espnTeamId) => {
			const totals = box.tableTotals.get(espnTeamId)
			if (!totals) return noValue(`player tables for team ${espnTeamId}`)
			return value(parseStatNumber(totals.get(key)) ?? 0)
		},
		source: {
			origin: "player_table_total",
			keys: [key],
			parse: parseStatNumber,
		},
	}
}

// One "category.stat" from ESPN's regular-season statistics, or several added
// up. A rate names the count it's a rate of (`rateOf`): with none of that
// count, the rate has no value whatever ESPN prints for it.
function seasonStat(
	subject: "player" | "team",
	keys: readonly string[],
	rateOf?: string,
): SeasonExtractor {
	const categories = new Set(keys.map((key) => key.split(".")[0]))
	// Games per role only mean something for a single category; a sum across
	// categories counts the athlete's games once.
	const [category] = categories.size === 1 ? categories : [undefined]
	return {
		scope: "season",
		subject,
		needs: [subject === "player" ? "athleteStats" : "teamStats"],
		read: (sources, espnId, aggregation) => {
			const stats = (
				subject === "player" ? sources.athleteStats : sources.teamStats
			).get(espnId)
			if (!stats) {
				return {
					kind: "unavailable",
					reason: "fetch_failed",
					detail: `no season statistics for ESPN ${subject} ${espnId}`,
				}
			}
			// MLB counts games per role, since a pitcher's pitching games aren't his
			// batting games; the other leagues count them once under general.
			const gamesPlayed =
				(category ? stats.get(`${category}.gamesPlayed`) : undefined) ??
				stats.get("general.gamesPlayed") ??
				0
			if (gamesPlayed === 0) {
				return subject === "player"
					? DID_NOT_PLAY
					: {
							kind: "unavailable",
							reason: "stat_undefined",
							detail: `ESPN team ${espnId} has no games this season`,
						}
			}
			if (rateOf) {
				const rate = stats.get(keys[0] ?? "")
				if (!stats.get(rateOf) || rate === undefined) {
					return {
						kind: "unavailable",
						reason: "stat_undefined",
						detail: `no ${rateOf}, so ${keys.join(" + ")} has no value`,
					}
				}
				return value(roundToThousandths(rate))
			}
			// A category ESPN leaves out is one nothing was recorded in. A per-game
			// line comes from the total, since ESPN's own per-game figure is rounded
			// to a whole number.
			const total = keys.reduce((sum, key) => sum + (stats.get(key) ?? 0), 0)
			return value(
				aggregation === "per_game"
					? roundToThousandths(total / gamesPlayed)
					: total,
			)
		},
	}
}

const seasonPlayer = (key: string, rateOf?: string) =>
	seasonStat("player", [key], rateOf)
const seasonPlayerSum = (...keys: string[]) => seasonStat("player", keys)
const seasonTeam = (key: string, rateOf?: string) =>
	seasonStat("team", [key], rateOf)

// Wins come from the standings, the record ESPN publishes, and are always a
// season total.
const standingsWins: SeasonExtractor = {
	scope: "season",
	subject: "team",
	needs: ["standings"],
	read: ({ winsByTeam }, espnTeamId) => {
		if (!winsByTeam) {
			return {
				kind: "unavailable",
				reason: "fetch_failed",
				detail: "couldn't read ESPN's standings",
			}
		}
		const wins = winsByTeam.get(espnTeamId)
		return wins === undefined
			? {
					kind: "unavailable",
					reason: "subject_not_in_box_score",
					detail: `ESPN team ${espnTeamId} isn't in the standings`,
				}
			: value(wins)
	},
}

type GameStatKey = Extract<AutoResolveStatKey, `${string}:game:${string}`>
type SeasonStatKey = Extract<AutoResolveStatKey, `${string}:season:${string}`>

// Stat definitions follow ESPN's own box score. Where a sport has more than one
// reasonable reading, the one used here is the one ESPN prints: NBA team
// rebounds and turnovers include those credited to the team rather than a
// player; NFL team passing yards are net of sacks, while a player's are gross;
// NFL team sacks and interceptions are the defense's, not the offense's.
export const GAME_EXTRACTORS = {
	"nba:game:player:Points": nbaPlayer("points"),
	"nba:game:player:3-Pointers Made": nbaPlayer(
		"threePointFieldGoalsMade-threePointFieldGoalsAttempted",
		parseMadeAttempted,
	),
	"nba:game:player:Rebounds": nbaPlayer("rebounds"),
	"nba:game:player:Assists": nbaPlayer("assists"),
	"nba:game:player:Turnovers": nbaPlayer("turnovers"),
	"nba:game:player:Steals": nbaPlayer("steals"),
	"nba:game:player:Blocks": nbaPlayer("blocks"),
	"nba:game:player:Minutes": nbaPlayer("minutes"),
	"nba:game:team:Points": teamScore,
	"nba:game:team:3-Pointers Made": teamBoxStat(
		"threePointFieldGoalsMade-threePointFieldGoalsAttempted",
		parseMadeAttempted,
	),
	"nba:game:team:Rebounds": teamBoxStat("totalRebounds"),
	"nba:game:team:Assists": teamBoxStat("assists"),
	"nba:game:team:Turnovers": teamBoxStat("totalTurnovers"),
	"nba:game:team:Steals": teamBoxStat("steals"),
	"nba:game:team:Blocks": teamBoxStat("blocks"),

	"nfl:game:player:Passing Yards": nflPlayer("passing.passingYards"),
	"nfl:game:player:Passing Touchdowns": nflPlayer("passing.passingTouchdowns"),
	"nfl:game:player:Rushing Yards": nflPlayer("rushing.rushingYards"),
	"nfl:game:player:Rushing Touchdowns": nflPlayer("rushing.rushingTouchdowns"),
	"nfl:game:player:Rushing + Receiving Yards": nflPlayer(
		"rushing.rushingYards",
		"receiving.receivingYards",
	),
	"nfl:game:player:Receiving Yards": nflPlayer("receiving.receivingYards"),
	"nfl:game:player:Receptions": nflPlayer("receiving.receptions"),
	"nfl:game:player:Receiving Touchdowns": nflPlayer(
		"receiving.receivingTouchdowns",
	),
	"nfl:game:player:Sacks": nflPlayer("defensive.sacks"),
	"nfl:game:player:Interceptions": nflPlayer("interceptions.interceptions"),
	"nfl:game:team:Points": teamScore,
	"nfl:game:team:Passing Yards": teamBoxStat("netPassingYards"),
	"nfl:game:team:Passing Touchdowns": teamTableTotal(
		"passing.passingTouchdowns",
	),
	"nfl:game:team:Rushing Yards": teamBoxStat("rushingYards"),
	"nfl:game:team:Rushing Touchdowns": teamTableTotal(
		"rushing.rushingTouchdowns",
	),
	"nfl:game:team:Receiving Yards": teamTableTotal("receiving.receivingYards"),
	"nfl:game:team:Receptions": teamTableTotal("receiving.receptions"),
	"nfl:game:team:Receiving Touchdowns": teamTableTotal(
		"receiving.receivingTouchdowns",
	),
	"nfl:game:team:Sacks": teamTableTotal("defensive.sacks"),
	"nfl:game:team:Interceptions": teamTableTotal("interceptions.interceptions"),

	"mlb:game:player:Hits": mlbCounting("batting", "hits"),
	"mlb:game:player:Home Runs": mlbCounting("batting", "homeRuns"),
	// Derived from the play-by-play when the box score is parsed; see
	// deriveTotalBases in db/sync/box-score-parse.ts.
	"mlb:game:player:Total Bases": mlbCounting("batting", "totalBases"),
	"mlb:game:player:RBIs": mlbCounting("batting", "RBIs"),
	"mlb:game:player:Runs": mlbCounting("batting", "runs"),
	"mlb:game:player:Walks (Batting)": mlbCounting("batting", "walks"),
	"mlb:game:player:Strikeouts (Batting)": mlbCounting("batting", "strikeouts"),
	"mlb:game:player:Stolen Bases": mlbBatterGameStat("stolenBases"),
	"mlb:game:player:Batting Average": mlbBatterGameStat("avg"),
	"mlb:game:player:On-Base Percentage": mlbBatterGameStat("onBasePct"),
	"mlb:game:player:Slugging Percentage": mlbBatterGameStat("slugAvg"),
	"mlb:game:player:Strikeouts (Pitching)": mlbCounting(
		"pitching",
		"strikeouts",
	),
	"mlb:game:player:Earned Runs Allowed": mlbCounting("pitching", "earnedRuns"),
	"mlb:game:player:Saves": mlbSaves,
	"mlb:game:player:Pitches Thrown": mlbCounting("pitching", "pitches"),
	"mlb:game:player:ERA": mlbPitchingRate(
		({ innings, earnedRuns }) => (9 * earnedRuns) / innings,
	),
	"mlb:game:player:WHIP": mlbPitchingRate(
		({ innings, hits, walks }) => (hits + walks) / innings,
	),
	"mlb:game:team:Hits": teamBoxStat("batting.hits"),
	"mlb:game:team:Home Runs": teamBoxStat("batting.homeRuns"),
	"mlb:game:team:Total Bases": teamBoxStat("batting.totalBases"),
	"mlb:game:team:RBIs": teamBoxStat("batting.RBIs"),
	"mlb:game:team:Runs": teamBoxStat("batting.runs"),
	"mlb:game:team:Walks (Batting)": teamBoxStat("batting.walks"),
	"mlb:game:team:Strikeouts (Batting)": teamBoxStat("batting.strikeouts"),
	"mlb:game:team:Stolen Bases": teamBoxStat("batting.stolenBases"),
	"mlb:game:team:Batting Average": teamBoxStat("batting.avg", parseRate),
	"mlb:game:team:On-Base Percentage": teamBoxStat(
		"batting.onBasePct",
		parseRate,
	),
	"mlb:game:team:Slugging Percentage": teamBoxStat(
		"batting.slugAvg",
		parseRate,
	),
	"mlb:game:team:Strikeouts (Pitching)": teamBoxStat("pitching.strikeouts"),
	"mlb:game:team:Earned Runs Allowed": teamBoxStat("pitching.earnedRuns"),
	"mlb:game:team:Saves": teamBoxStat("pitching.saves"),
	"mlb:game:team:Pitches Thrown": teamBoxStat("pitching.pitches"),
	"mlb:game:team:ERA": teamBoxStat("pitching.ERA", parseRate),
	"mlb:game:team:WHIP": teamBoxStat("pitching.WHIP", parseRate),
} as const satisfies Record<GameStatKey, GameExtractor>

// The same definitions as the game table, read from ESPN's season statistics:
// NBA team rebounds and turnovers include the team's own, NFL team passing
// yards are net, and NFL team sacks and interceptions are the defense's.
export const SEASON_EXTRACTORS = {
	"nba:season:player:Points": seasonPlayer("offensive.points"),
	"nba:season:player:3-Pointers Made": seasonPlayer(
		"offensive.threePointFieldGoalsMade",
	),
	"nba:season:player:Rebounds": seasonPlayer("general.rebounds"),
	"nba:season:player:Assists": seasonPlayer("offensive.assists"),
	"nba:season:player:Turnovers": seasonPlayer("offensive.turnovers"),
	"nba:season:player:Steals": seasonPlayer("defensive.steals"),
	"nba:season:player:Blocks": seasonPlayer("defensive.blocks"),
	"nba:season:player:Minutes": seasonPlayer("general.minutes"),
	"nba:season:team:Points": seasonTeam("offensive.points"),
	"nba:season:team:3-Pointers Made": seasonTeam(
		"offensive.threePointFieldGoalsMade",
	),
	"nba:season:team:Rebounds": seasonTeam("general.totalRebounds"),
	"nba:season:team:Assists": seasonTeam("offensive.assists"),
	"nba:season:team:Turnovers": seasonTeam("offensive.totalTurnovers"),
	"nba:season:team:Steals": seasonTeam("defensive.steals"),
	"nba:season:team:Blocks": seasonTeam("defensive.blocks"),
	"nba:season:team:Wins": standingsWins,

	"nfl:season:player:Passing Yards": seasonPlayer("passing.passingYards"),
	"nfl:season:player:Passing Touchdowns": seasonPlayer(
		"passing.passingTouchdowns",
	),
	"nfl:season:player:Rushing Yards": seasonPlayer("rushing.rushingYards"),
	"nfl:season:player:Rushing Touchdowns": seasonPlayer(
		"rushing.rushingTouchdowns",
	),
	"nfl:season:player:Rushing + Receiving Yards": seasonPlayerSum(
		"rushing.rushingYards",
		"receiving.receivingYards",
	),
	"nfl:season:player:Receiving Yards": seasonPlayer("receiving.receivingYards"),
	"nfl:season:player:Receptions": seasonPlayer("receiving.receptions"),
	"nfl:season:player:Receiving Touchdowns": seasonPlayer(
		"receiving.receivingTouchdowns",
	),
	"nfl:season:player:Sacks": seasonPlayer("defensive.sacks"),
	"nfl:season:player:Interceptions": seasonPlayer(
		"defensiveInterceptions.interceptions",
	),
	"nfl:season:team:Points": seasonTeam("scoring.totalPoints"),
	"nfl:season:team:Passing Yards": seasonTeam("passing.netPassingYards"),
	"nfl:season:team:Passing Touchdowns": seasonTeam("passing.passingTouchdowns"),
	"nfl:season:team:Rushing Yards": seasonTeam("rushing.rushingYards"),
	"nfl:season:team:Rushing Touchdowns": seasonTeam("rushing.rushingTouchdowns"),
	"nfl:season:team:Receiving Yards": seasonTeam("receiving.receivingYards"),
	"nfl:season:team:Receptions": seasonTeam("receiving.receptions"),
	"nfl:season:team:Receiving Touchdowns": seasonTeam(
		"receiving.receivingTouchdowns",
	),
	"nfl:season:team:Sacks": seasonTeam("defensive.sacks"),
	"nfl:season:team:Interceptions": seasonTeam(
		"defensiveInterceptions.interceptions",
	),
	"nfl:season:team:Wins": standingsWins,

	"mlb:season:player:Hits": seasonPlayer("batting.hits"),
	"mlb:season:player:Home Runs": seasonPlayer("batting.homeRuns"),
	"mlb:season:player:Total Bases": seasonPlayer("batting.totalBases"),
	"mlb:season:player:RBIs": seasonPlayer("batting.RBIs"),
	"mlb:season:player:Runs": seasonPlayer("batting.runs"),
	"mlb:season:player:Walks (Batting)": seasonPlayer("batting.walks"),
	"mlb:season:player:Strikeouts (Batting)": seasonPlayer("batting.strikeouts"),
	"mlb:season:player:Stolen Bases": seasonPlayer("batting.stolenBases"),
	"mlb:season:player:Batting Average": seasonPlayer(
		"batting.avg",
		"batting.atBats",
	),
	"mlb:season:player:On-Base Percentage": seasonPlayer(
		"batting.onBasePct",
		"batting.plateAppearances",
	),
	"mlb:season:player:Slugging Percentage": seasonPlayer(
		"batting.slugAvg",
		"batting.atBats",
	),
	"mlb:season:player:Strikeouts (Pitching)": seasonPlayer(
		"pitching.strikeouts",
	),
	"mlb:season:player:Earned Runs Allowed": seasonPlayer("pitching.earnedRuns"),
	"mlb:season:player:Saves": seasonPlayer("pitching.saves"),
	"mlb:season:player:Pitches Thrown": seasonPlayer("pitching.pitches"),
	"mlb:season:player:ERA": seasonPlayer("pitching.ERA", "pitching.innings"),
	"mlb:season:player:WHIP": seasonPlayer("pitching.WHIP", "pitching.innings"),
	"mlb:season:team:Hits": seasonTeam("batting.hits"),
	"mlb:season:team:Home Runs": seasonTeam("batting.homeRuns"),
	"mlb:season:team:Total Bases": seasonTeam("batting.totalBases"),
	"mlb:season:team:RBIs": seasonTeam("batting.RBIs"),
	"mlb:season:team:Runs": seasonTeam("batting.runs"),
	"mlb:season:team:Walks (Batting)": seasonTeam("batting.walks"),
	"mlb:season:team:Strikeouts (Batting)": seasonTeam("batting.strikeouts"),
	"mlb:season:team:Stolen Bases": seasonTeam("batting.stolenBases"),
	"mlb:season:team:Batting Average": seasonTeam(
		"batting.avg",
		"batting.atBats",
	),
	"mlb:season:team:On-Base Percentage": seasonTeam(
		"batting.onBasePct",
		"batting.plateAppearances",
	),
	"mlb:season:team:Slugging Percentage": seasonTeam(
		"batting.slugAvg",
		"batting.atBats",
	),
	"mlb:season:team:Strikeouts (Pitching)": seasonTeam("pitching.strikeouts"),
	"mlb:season:team:Earned Runs Allowed": seasonTeam("pitching.earnedRuns"),
	"mlb:season:team:Saves": seasonTeam("pitching.saves"),
	"mlb:season:team:Pitches Thrown": seasonTeam("pitching.pitches"),
	"mlb:season:team:ERA": seasonTeam("pitching.ERA", "pitching.innings"),
	"mlb:season:team:WHIP": seasonTeam("pitching.WHIP", "pitching.innings"),
	"mlb:season:team:Wins": standingsWins,
} as const satisfies Record<SeasonStatKey, SeasonExtractor>

// Every key in AUTO_RESOLVE_STATS, which the annotation holds to exactly.
export const EXTRACTORS: Record<AutoResolveStatKey, Extractor> = {
	...GAME_EXTRACTORS,
	...SEASON_EXTRACTORS,
}
