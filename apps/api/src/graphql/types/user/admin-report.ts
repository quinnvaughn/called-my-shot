import { requireAdmin } from "../../../lib/auth"
import { AuthenticationError, AuthorizationError } from "../../../lib/errors"
import {
	type CoCallerRow,
	loadFrequentCoCallers,
	loadSelfGradingReport,
	type SelfGradingRow,
} from "../../../lib/self-grading-report"
import { builder } from "../../builder"

const SelfGradingRowRef = builder
	.objectRef<SelfGradingRow>("AdminSelfGradingRow")
	.implement({
		fields: (t) => ({
			userId: t.exposeID("userId"),
			username: t.exposeString("username"),
			handGradedCount: t.exposeInt("handGradedCount"),
			ownCallCount: t.exposeInt("ownCallCount"),
			ownCallWins: t.exposeInt("ownCallWins"),
			ownCallLosses: t.exposeInt("ownCallLosses"),
			ownCallPoints: t.exposeInt("ownCallPoints"),
			totalPoints: t.exposeInt("totalPoints"),
			overturnedCount: t.exposeInt("overturnedCount"),
		}),
	})

const CoCallerRowRef = builder
	.objectRef<CoCallerRow>("AdminCoCallerRow")
	.implement({
		fields: (t) => ({
			userId: t.exposeID("userId"),
			username: t.exposeString("username"),
			emailVerified: t.exposeBoolean("emailVerified"),
			joinedAt: t.field({
				type: "DateTime",
				resolve: (row) => row.joinedAt,
			}),
			sharedCount: t.exposeInt("sharedCount"),
			wins: t.exposeInt("wins"),
			losses: t.exposeInt("losses"),
			points: t.exposeInt("points"),
			shareOfTheirCalls: t.exposeFloat("shareOfTheirCalls"),
		}),
	})

// Integrity tab - see lib/self-grading-report.ts. Plain lists, no pagination:
// only creators who have hand-graded something appear at all.
builder.queryFields((t) => ({
	adminSelfGradingReport: t.field({
		type: [SelfGradingRowRef],
		errors: { types: [AuthenticationError, AuthorizationError] },
		resolve: (_root, _args, ctx) => {
			requireAdmin(ctx)
			return loadSelfGradingReport()
		},
	}),

	adminFrequentCoCallers: t.field({
		type: [CoCallerRowRef],
		errors: { types: [AuthenticationError, AuthorizationError] },
		args: {
			creatorId: t.arg.id({ required: true }),
			minShared: t.arg.int({ required: false }),
		},
		resolve: (_root, args, ctx) => {
			requireAdmin(ctx)
			return loadFrequentCoCallers(String(args.creatorId), args.minShared ?? 2)
		},
	}),
}))
