import type {
	StatContext,
	StatContextGame,
	StatContextMatchup,
	StatContextMatchupSide,
	StatContextMeeting,
	StatContextOpponentAllowed,
	StatContextDifferential,
	StatContextRankedPlayer,
	StatContextRecord,
	StatContextRest,
	StatContextResult,
	StatContextShare,
	StatContextSplit,
	StatContextSplitRecord,
	StatContextStreak,
	StatContextSubject,
} from "../../../lib/stat-context/types"
import { builder } from "../../builder"

// Every card is nullable while the scalars inside a present card are not.
// DefaultFieldNullability is false in builder.ts, so without this a rookie's
// first game or a stat the player tables carry no total for would be a hard
// field error that takes the whole Question down with it.

const SplitRef = builder
	.objectRef<StatContextSplit>("StatContextSplit")
	.implement({
		fields: (t) => ({
			// Appearances the number is built from, never nights off.
			games: t.exposeInt("games"),
			total: t.exposeFloat("total"),
			mean: t.exposeFloat("mean"),
			// Null when the question has no line to clear.
			overLine: t.int({ nullable: true, resolve: (s) => s.overLine }),
		}),
	})

const GameRef = builder
	.objectRef<StatContextGame>("StatContextGame")
	.implement({
		fields: (t) => ({
			gameId: t.exposeID("gameId"),
			date: t.field({
				type: "DateTime",
				resolve: (g) => g.date,
			}),
			opponentTeamId: t.exposeID("opponentTeamId"),
			isHome: t.exposeBoolean("isHome"),
			// Null on a night off, and also when ESPN recorded no number. The
			// page tells them apart with didNotPlay, because a blank line and a
			// rest day are different facts about recent form.
			value: t.float({ nullable: true, resolve: (g) => g.value }),
			didNotPlay: t.exposeBoolean("didNotPlay"),
		}),
	})

const RestRef = builder
	.objectRef<StatContextRest>("StatContextRest")
	.implement({
		fields: (t) => ({
			// Exposed so the page can say where the line was drawn - "short rest"
			// means short for this player, not a league-wide number.
			medianRestDays: t.exposeFloat("medianRestDays"),
			shortRest: t.field({
				type: SplitRef,
				nullable: true,
				resolve: (r) => r.shortRest,
			}),
			longRest: t.field({
				type: SplitRef,
				nullable: true,
				resolve: (r) => r.longRest,
			}),
		}),
	})

const OpponentAllowedRef = builder
	.objectRef<StatContextOpponentAllowed>("StatContextOpponentAllowed")
	.implement({
		fields: (t) => ({
			teamId: t.exposeID("teamId"),
			games: t.exposeInt("games"),
			meanAllowed: t.exposeFloat("meanAllowed"),
			// Empty when unfiltered. The card has to say whether this is what the
			// opponent allows overall or what they allow to this position.
			positions: t.exposeStringList("positions"),
		}),
	})

const ShareRef = builder
	.objectRef<StatContextShare>("StatContextShare")
	.implement({
		fields: (t) => ({
			playerTotal: t.exposeFloat("playerTotal"),
			teamTotal: t.exposeFloat("teamTotal"),
			sharePct: t.exposeFloat("sharePct"),
			games: t.exposeInt("games"),
		}),
	})

const SubjectRef = builder
	.objectRef<StatContextSubject>("StatContextSubject")
	.implement({
		fields: (t) => ({
			label: t.exposeString("label"),
			playerId: t.id({ nullable: true, resolve: (s) => s.playerId }),
			teamId: t.id({ nullable: true, resolve: (s) => s.teamId }),
			recentGames: t.field({
				type: [GameRef],
				resolve: (s) => s.recentGames,
			}),
			seasonToDate: t.field({
				type: SplitRef,
				nullable: true,
				resolve: (s) => s.seasonToDate,
			}),
			home: t.field({
				type: SplitRef,
				nullable: true,
				resolve: (s) => s.home,
			}),
			away: t.field({
				type: SplitRef,
				nullable: true,
				resolve: (s) => s.away,
			}),
			rest: t.field({
				type: RestRef,
				nullable: true,
				resolve: (s) => s.rest,
			}),
			opponentAllowed: t.field({
				type: OpponentAllowedRef,
				nullable: true,
				resolve: (s) => s.opponentAllowed,
			}),
			teamShare: t.field({
				type: ShareRef,
				nullable: true,
				resolve: (s) => s.teamShare,
			}),
		}),
	})

const RankedPlayerRef = builder
	.objectRef<StatContextRankedPlayer>("StatContextRankedPlayer")
	.implement({
		fields: (t) => ({
			playerId: t.exposeID("playerId"),
			label: t.exposeString("label"),
			mean: t.exposeFloat("mean"),
			games: t.exposeInt("games"),
		}),
	})

// SCREAMING_CASE names over the lowercase values, matching how QuestionShape
// crosses the wire in ./enums.ts. A tie is a value here rather than a boolean
// bolted onto a win, because a 6-6-1 and a 6-7 are different records.
const OutcomeEnum = builder.enumType("StatContextOutcome", {
	values: {
		WIN: { value: "win" },
		LOSS: { value: "loss" },
		TIE: { value: "tie" },
	} as const,
})

const MatchupFocusEnum = builder.enumType("StatContextMatchupFocus", {
	values: {
		WINNER: { value: "winner" },
		SCORING: { value: "scoring" },
	} as const,
})

// Named per sport because these are not one metric with three names: a net
// rating is a rate per 100 possessions, the other two are season totals. The
// page needs the kind to name and format the value correctly - see
// lib/stat-context/differential.ts.
const DifferentialKindEnum = builder.enumType("StatContextDifferentialKind", {
	values: {
		NET_RATING: { value: "net_rating" },
		RUN_DIFFERENTIAL: { value: "run_differential" },
		POINT_DIFFERENTIAL: { value: "point_differential" },
	} as const,
})

const DifferentialRef = builder
	.objectRef<StatContextDifferential>("StatContextDifferential")
	.implement({
		fields: (t) => ({
			kind: t.field({ type: DifferentialKindEnum, resolve: (d) => d.kind }),
			value: t.exposeFloat("value"),
			games: t.exposeInt("games"),
		}),
	})

const SplitRecordRef = builder
	.objectRef<StatContextSplitRecord>("StatContextSplitRecord")
	.implement({
		fields: (t) => ({
			games: t.exposeInt("games"),
			wins: t.exposeInt("wins"),
			losses: t.exposeInt("losses"),
			ties: t.exposeInt("ties"),
		}),
	})

const RecordRef = builder
	.objectRef<StatContextRecord>("StatContextRecord")
	.implement({
		fields: (t) => ({
			// Always wins + losses + ties, so the page can print the sample under
			// the record without adding them back up.
			games: t.exposeInt("games"),
			wins: t.exposeInt("wins"),
			losses: t.exposeInt("losses"),
			ties: t.exposeInt("ties"),
			pointsForPerGame: t.exposeFloat("pointsForPerGame"),
			pointsAgainstPerGame: t.exposeFloat("pointsAgainstPerGame"),
			// Null when the question has no line to clear.
			overLine: t.int({ nullable: true, resolve: (r) => r.overLine }),
		}),
	})

const ResultRef = builder
	.objectRef<StatContextResult>("StatContextResult")
	.implement({
		fields: (t) => ({
			gameId: t.exposeID("gameId"),
			date: t.field({ type: "DateTime", resolve: (r) => r.date }),
			opponentTeamId: t.exposeID("opponentTeamId"),
			// Carried rather than mapped on the page: a team's own schedule runs
			// through opponents this game has nothing to do with, and "W 24-17 @"
			// with nothing after it says nothing.
			opponentAbbreviation: t.exposeString("opponentAbbreviation"),
			isHome: t.exposeBoolean("isHome"),
			pointsFor: t.exposeInt("pointsFor"),
			pointsAgainst: t.exposeInt("pointsAgainst"),
			outcome: t.field({ type: OutcomeEnum, resolve: (r) => r.outcome }),
		}),
	})

const StreakRef = builder
	.objectRef<StatContextStreak>("StatContextStreak")
	.implement({
		fields: (t) => ({
			outcome: t.field({ type: OutcomeEnum, resolve: (s) => s.outcome }),
			length: t.exposeInt("length"),
		}),
	})

const MeetingRef = builder
	.objectRef<StatContextMeeting>("StatContextMeeting")
	.implement({
		fields: (t) => ({
			gameId: t.exposeID("gameId"),
			date: t.field({ type: "DateTime", resolve: (m) => m.date }),
			// The home side of THAT game, which need not be the home side of the
			// one being asked about.
			homeTeamId: t.exposeID("homeTeamId"),
			awayTeamId: t.exposeID("awayTeamId"),
			homeScore: t.exposeInt("homeScore"),
			awayScore: t.exposeInt("awayScore"),
			// Null on a tie, which is a result and not a missing one.
			winnerTeamId: t.id({ nullable: true, resolve: (m) => m.winnerTeamId }),
		}),
	})

const MatchupSideRef = builder
	.objectRef<StatContextMatchupSide>("StatContextMatchupSide")
	.implement({
		fields: (t) => ({
			label: t.exposeString("label"),
			teamId: t.exposeID("teamId"),
			isHome: t.exposeBoolean("isHome"),
			// The sport's own scoring-gap figure, from the last standings reading
			// taken before this question locked.
			differential: t.field({
				type: DifferentialRef,
				nullable: true,
				resolve: (s) => s.differential,
			}),
			overall: t.field({
				type: RecordRef,
				nullable: true,
				resolve: (s) => s.overall,
			}),
			// Narrowed to the side of the scoreboard this team is on in this game:
			// home games for the home team, road games for the visitor.
			inThisRole: t.field({
				type: SplitRecordRef,
				nullable: true,
				resolve: (s) => s.inThisRole,
			}),
			// This side's record against the other, over every meeting this
			// season rather than only the ones listed.
			headToHead: t.field({
				type: SplitRecordRef,
				nullable: true,
				resolve: (s) => s.headToHead,
			}),
			// Set only when ten games stand behind it.
			lastTen: t.field({
				type: SplitRecordRef,
				nullable: true,
				resolve: (s) => s.lastTen,
			}),
			streak: t.field({
				type: StreakRef,
				nullable: true,
				resolve: (s) => s.streak,
			}),
			recentResults: t.field({
				type: [ResultRef],
				resolve: (s) => s.recentResults,
			}),
			// Null for a team whose first game of the season this is.
			restDays: t.int({ nullable: true, resolve: (s) => s.restDays }),
		}),
	})

const MatchupRef = builder
	.objectRef<StatContextMatchup>("StatContextMatchup")
	.implement({
		fields: (t) => ({
			// Which number leads each column - the record for a who-wins question,
			// scoring for a game total.
			focus: t.field({ type: MatchupFocusEnum, resolve: (m) => m.focus }),
			// Always two, in the order the question lists its options.
			sides: t.field({ type: [MatchupSideRef], resolve: (m) => m.sides }),
			// Most recent first, empty when these two haven't met this season,
			// which is the normal case in a league whose teams meet once a year.
			meetings: t.field({ type: [MeetingRef], resolve: (m) => m.meetings }),
		}),
	})

export const StatContextRef = builder
	.objectRef<StatContext>("StatContext")
	.implement({
		fields: (t) => ({
			statLabel: t.exposeString("statLabel"),
			lastN: t.exposeInt("lastN"),
			// One entry for a one-sided question, two for a head-to-head, in the
			// order its options are listed.
			subjects: t.field({ type: [SubjectRef], resolve: (c) => c.subjects }),
			// Populated instead of subjects for a pool question ("who leads
			// this game"), ordered best first. Empty otherwise.
			ranking: t.field({
				type: [RankedPlayerRef],
				resolve: (c) => c.ranking,
			}),
			// Populated instead of either of the above for a game-level question
			// ("who wins", a game total), which has no per-subject stat to log.
			// Null otherwise.
			matchup: t.field({
				type: MatchupRef,
				nullable: true,
				resolve: (c) => c.matchup,
			}),
		}),
	})
