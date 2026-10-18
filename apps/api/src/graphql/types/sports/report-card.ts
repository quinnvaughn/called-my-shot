import type {
	ReportCardFamilyRow,
	ReportCardShapeRow,
} from "../../../lib/report-card/compute"
import type {
	ReportCardGameResult,
	ReportCardResult,
} from "../../../lib/report-card/load"
import { builder } from "../../builder"
import { CallRef } from "../question"
import { QuestionShape, ShapeFamily } from "../question/enums"
import { GameRef } from "./game"
import { LeagueRef } from "./league"

export const ReportCardFamilyRowRef = builder
	.objectRef<ReportCardFamilyRow>("ReportCardFamilyRow")
	.implement({
		fields: (t) => ({
			family: t.field({ type: ShapeFamily, resolve: (r) => r.family }),
			label: t.exposeString("label"),
			settledCount: t.exposeInt("settledCount"),
			wins: t.exposeInt("wins"),
			losses: t.exposeInt("losses"),
			pendingCount: t.exposeInt("pendingCount"),
			netPoints: t.exposeInt("netPoints"),
			committedPoints: t.exposeInt("committedPoints"),
			pendingStake: t.exposeInt("pendingStake"),
			returnPct: t.exposeFloat("returnPct", { nullable: true }),
		}),
	})

export const ReportCardShapeRowRef = builder
	.objectRef<ReportCardShapeRow>("ReportCardShapeRow")
	.implement({
		fields: (t) => ({
			shape: t.field({ type: QuestionShape, resolve: (r) => r.shape }),
			// Which family row this one nests under.
			family: t.field({ type: ShapeFamily, resolve: (r) => r.family }),
			label: t.exposeString("label"),
			settledCount: t.exposeInt("settledCount"),
			wins: t.exposeInt("wins"),
			losses: t.exposeInt("losses"),
			pendingCount: t.exposeInt("pendingCount"),
			netPoints: t.exposeInt("netPoints"),
			committedPoints: t.exposeInt("committedPoints"),
			pendingStake: t.exposeInt("pendingStake"),
			returnPct: t.exposeFloat("returnPct", { nullable: true }),
		}),
	})

// Every settled call the caller made on one game in the window, netted.
//
// Declared apart from its implement() call because GameRef reaches back here
// through UserRef, and an inline implement() makes that loop an inference
// cycle.
const ReportCardGameRef =
	builder.objectRef<ReportCardGameResult>("ReportCardGame")
ReportCardGameRef.implement({
	fields: (t) => ({
		game: t.field({ type: GameRef, resolve: (r) => r.game }),
		netPoints: t.exposeInt("netPoints"),
		wins: t.exposeInt("wins"),
		losses: t.exposeInt("losses"),
	}),
})

// How a caller did across one window of games. Lives under sports/ rather
// than user/ to keep the existing dependency direction: user/ imports from
// sports/ (LeagueRef), nothing in sports/ imports user/. That's also why
// there's no `user` field here - sports/ pulling in UserRef while user/refs.ts
// pulls in ReportCardRef would be a cycle, and both places that resolve a
// report card already have the user in hand as the parent object.
//
// CallRef comes from question/, which imports nothing from sports/, so the
// biggest hit/miss fields are safe. user/streaks.ts already does the same
// thing for a sweep's calls.
export const ReportCardRef = builder
	.objectRef<ReportCardResult>("ReportCard")
	.implement({
		fields: (t) => ({
			league: t.field({ type: LeagueRef, resolve: (r) => r.league }),
			windowKey: t.string({ resolve: (r) => r.window.key }),
			// "WEEK 3" / "SAT SEP 20", with "SEP 20 - SEP 22" as the sublabel on
			// a week. Carried on the card so the permalink can title itself
			// without a second query, and so it still has something to name when
			// the card is empty.
			windowLabel: t.string({ resolve: (r) => r.window.label }),
			windowSublabel: t.string({
				nullable: true,
				resolve: (r) => r.window.sublabel,
			}),

			settledCount: t.exposeInt("settledCount"),
			wins: t.exposeInt("wins"),
			losses: t.exposeInt("losses"),
			pendingCount: t.exposeInt("pendingCount"),
			// The calls alone, which is what returnPct is a return on.
			netPoints: t.exposeInt("netPoints"),
			// Streak milestones, sweeps and chains dated in this window - see
			// withBonuses for why none touches returnPct or the grade.
			streakBonusPoints: t.exposeInt("streakBonusPoints"),
			sweepBonusPoints: t.exposeInt("sweepBonusPoints"),
			chainBonusPoints: t.exposeInt("chainBonusPoints"),
			// netPoints plus every bonus.
			totalPoints: t.exposeInt("totalPoints"),
			committedPoints: t.exposeInt("committedPoints"),
			pendingStake: t.exposeInt("pendingStake"),
			// Left unrounded on purpose - every render site rounds once, the way
			// accuracy already is on the profile. Rounding here and again in the
			// card is how a page and its og:image end up disagreeing. Null when
			// nothing has been committed yet.
			returnPct: t.exposeFloat("returnPct", { nullable: true }),
			// Null below REPORT_CARD_MIN_SETTLED, and whenever returnPct is.
			grade: t.string({ nullable: true, resolve: (r) => r.grade }),
			isFinal: t.exposeBoolean("isFinal"),

			byFamily: t.field({
				type: [ReportCardFamilyRowRef],
				resolve: (r) => r.byFamily,
			}),
			byShape: t.field({
				type: [ReportCardShapeRowRef],
				resolve: (r) => r.byShape,
			}),

			// Null when the window holds no settled call on that side, which is
			// ordinary early in a slate: 4-0 so far has a hit and no miss.
			biggestHit: t.field({
				type: CallRef,
				nullable: true,
				resolve: (r) => r.biggestHit,
			}),
			biggestMiss: t.field({
				type: CallRef,
				nullable: true,
				resolve: (r) => r.biggestMiss,
			}),

			// Null below REPORT_CARD_MIN_GAMES games with a settled call, and
			// whenever no game came out on that side of zero.
			bestGame: t.field({
				type: ReportCardGameRef,
				nullable: true,
				resolve: (r) => r.bestGame,
			}),
			worstGame: t.field({
				type: ReportCardGameRef,
				nullable: true,
				resolve: (r) => r.worstGame,
			}),
		}),
	})
