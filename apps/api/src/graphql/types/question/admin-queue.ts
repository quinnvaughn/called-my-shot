import type {
	AutoResolveFailure as AutoResolveFailureValue,
	Question,
	questionReports,
	resolutionDisputes,
} from "../../../db/schema"
import { builder } from "../../builder"
import { AutoResolveFailure } from "./enums"
import { QuestionReportRef, ResolutionDisputeRef } from "./moderation-objects"
import { QuestionRef } from "./question-object"

// A system question the automatic resolver couldn't settle. failureReason is
// null for one it never got to try: its game never went final.
export type AutoResolveEscalation = {
	question: Question
	failureReason: AutoResolveFailureValue | null
	failureDetail: string | null
}

const AutoResolveEscalationRef = builder
	.objectRef<AutoResolveEscalation>("AutoResolveEscalation")
	.implement({
		fields: (t) => ({
			question: t.field({ type: QuestionRef, resolve: (e) => e.question }),
			failureReason: t.field({
				type: AutoResolveFailure,
				nullable: true,
				resolve: (e) => e.failureReason,
			}),
			failureDetail: t.exposeString("failureDetail", { nullable: true }),
		}),
	})

type AdminQueueSummaryData = {
	needsResolution: Question[]
	probablyStillLive: Question[]
	autoResolveEscalated: AutoResolveEscalation[]
	disputed: (typeof resolutionDisputes.$inferSelect)[]
	reported: (typeof questionReports.$inferSelect)[]
	liveQuestionsCount: number
	usersLockedCount: number
}

export const AdminQueueSummaryRef = builder
	.objectRef<AdminQueueSummaryData>("AdminQueueSummary")
	.implement({
		fields: (t) => ({
			// "Locked a while, likely over" - estimate only (locked-time vs. a
			// typical game length per league, see lib/game-length.ts), not a
			// confirmed final. Manual questions only; a system one lands in
			// autoResolveEscalated below if it needs a person. Has Resolve/Void
			// actions on the frontend.
			needsResolution: t.field({
				type: [QuestionRef],
				resolve: (d) => d.needsResolution,
			}),
			// "Locked recently, probably still live" - same estimate, other side
			// of the threshold. No actions on the frontend - nothing to act on
			// either way without a real result yet.
			probablyStillLive: t.field({
				type: [QuestionRef],
				resolve: (d) => d.probablyStillLive,
			}),
			autoResolveEscalated: t.field({
				type: [AutoResolveEscalationRef],
				resolve: (d) => d.autoResolveEscalated,
			}),
			disputed: t.field({
				type: [ResolutionDisputeRef],
				resolve: (d) => d.disputed,
			}),
			reported: t.field({
				type: [QuestionReportRef],
				resolve: (d) => d.reported,
			}),
			liveQuestionsCount: t.exposeInt("liveQuestionsCount"),
			usersLockedCount: t.exposeInt("usersLockedCount"),
		}),
	})
