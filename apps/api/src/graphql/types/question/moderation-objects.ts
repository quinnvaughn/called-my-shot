import { builder } from "../../builder"
import { DisputeStatus, ReportStatus, VoidReason } from "./enums"

export const ResolutionDisputeRef = builder.drizzleObject(
	"resolutionDisputes",
	{
		name: "ResolutionDispute",
		fields: (t) => ({
			id: t.exposeID("id"),
			reason: t.exposeString("reason"),
			status: t.field({ type: DisputeStatus, resolve: (d) => d.status }),
			// set by an admin once the dispute is decided
			resolutionNote: t.exposeString("resolutionNote", { nullable: true }),
			createdAt: t.field({
				type: "DateTime",
				resolve: (d) => d.createdAt,
			}),
			resolvedAt: t.field({
				type: "DateTime",
				nullable: true,
				resolve: (d) => d.resolvedAt,
			}),
			user: t.relation("user"),
			question: t.relation("question"),
		}),
	},
)

export const QuestionReportRef = builder.drizzleObject("questionReports", {
	name: "QuestionReport",
	fields: (t) => ({
		id: t.exposeID("id"),
		reason: t.field({ type: VoidReason, resolve: (r) => r.reason }),
		details: t.exposeString("details", { nullable: true }),
		status: t.field({ type: ReportStatus, resolve: (r) => r.status }),
		createdAt: t.field({
			type: "DateTime",
			resolve: (r) => r.createdAt,
		}),
		reviewedAt: t.field({
			type: "DateTime",
			nullable: true,
			resolve: (r) => r.reviewedAt,
		}),
		reportedBy: t.relation("reportedBy"),
		question: t.relation("question"),
	}),
})
