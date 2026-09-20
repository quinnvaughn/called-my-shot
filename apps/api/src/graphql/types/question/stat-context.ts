import type {
	StatContext,
	StatContextGame,
	StatContextOpponentAllowed,
	StatContextRankedPlayer,
	StatContextRest,
	StatContextShare,
	StatContextSplit,
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
			date: t.string({ resolve: (g) => g.date.toISOString() }),
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
		}),
	})
