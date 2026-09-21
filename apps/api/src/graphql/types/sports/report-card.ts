import type {
	ReportCardFamilyRow,
	ReportCardShapeRow,
} from "../../../lib/report-card/compute"
import type { ReportCardResult } from "../../../lib/report-card/load"
import { builder } from "../../builder"
import { CallRef } from "../question"
import { QuestionShape, ShapeFamily } from "../question/enums"
import { LeagueRef } from "./league"

const ReportCardFamilyRowRef = builder
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

const ReportCardShapeRowRef = builder
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
			netPoints: t.exposeInt("netPoints"),
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
		}),
	})
