import { reportPresserContentSchema } from "@called-my-shot/schemas"
import { useQueryClient } from "@tanstack/react-query"
import { match } from "ts-pattern"
import { ReportContentModal } from "#/components/moderation/report-content-modal"
import { ApiError } from "#/graphql/api-error"
import type {
	PresserReportReason as PresserReportReasonEnum,
	PresserReportTarget,
} from "#/graphql/generated/graphql"
import { useGqlMutation } from "#/graphql/hooks"
import {
	invalidatePressers,
	ReportPresserContentDocument,
} from "#/graphql/pressers/mutations"

type Props = {
	presserId: string
	presserQuestionId: string | null
	target: PresserReportTarget
}

const TITLES: Record<PresserReportTarget, string> = {
	QUESTION: "Report this question",
	ANSWER: "Report this answer",
	STATEMENT: "Report this statement",
}

export function ReportPresserModal({
	presserId,
	presserQuestionId,
	target,
}: Props) {
	const report = useGqlMutation(ReportPresserContentDocument)
	const queryClient = useQueryClient()

	async function submit({
		reason,
		details,
	}: {
		reason: string
		details: string
	}): Promise<string | null> {
		const parsed = reportPresserContentSchema.safeParse({
			presserId,
			presserQuestionId,
			target: target.toLowerCase(),
			reason,
			details,
		})
		if (!parsed.success) {
			return parsed.error.issues[0]?.message ?? "Check the form and try again."
		}
		const data = await report.mutateAsync({
			input: {
				presserId,
				presserQuestionId,
				target,
				reason: reason.toUpperCase() as PresserReportReasonEnum,
				details: details || undefined,
			},
		})
		const result = data?.reportPresserContent
		if (!result) return "Something went wrong. Try again."
		return match(result)
			.with({ __typename: "PresserReportPayload" }, async () => {
				await invalidatePressers(queryClient)
				return null
			})
			.with(
				{ __typename: "ValidationError" },
				async (r) => r.fieldErrors[0]?.message ?? r.message,
			)
			.with(ApiError, async (r) => r.message)
			.exhaustive()
	}

	return <ReportContentModal title={TITLES[target]} submit={submit} />
}
