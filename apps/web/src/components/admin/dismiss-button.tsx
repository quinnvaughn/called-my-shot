import { useQueryClient } from "@tanstack/react-query"
import { Button } from "#/components/ui/button"
import {
	DismissReportDocument,
	invalidateAdminQueue,
} from "#/graphql/admin/queue/mutations"
import { useGqlMutation } from "#/graphql/hooks"

export function DismissButton({ reportId }: { reportId: string }) {
	const queryClient = useQueryClient()
	const dismissReport = useGqlMutation(DismissReportDocument)

	return (
		<Button
			variant="outline"
			size="sm"
			loading={dismissReport.isPending}
			onClick={async () => {
				const data = await dismissReport.mutateAsync({ input: { reportId } })
				if (data?.dismissReport.__typename === "QuestionReport") {
					await invalidateAdminQueue(queryClient)
				}
			}}
		>
			Dismiss
		</Button>
	)
}
