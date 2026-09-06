import type {
	Question,
	questionReports,
	resolutionDisputes,
} from "../../../db/schema"
import { builder } from "../../builder"
import { QuestionReportRef, ResolutionDisputeRef } from "./moderation-objects"
import { QuestionRef } from "./question-object"

type AdminQueueSummaryData = {
	needsResolution: Question[]
	probablyStillLive: Question[]
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
			// confirmed final. Has Resolve/Void actions on the frontend.
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
