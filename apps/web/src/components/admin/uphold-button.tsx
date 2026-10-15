import { useQueryClient } from "@tanstack/react-query"
import { Button } from "#/components/ui/button"
import {
	invalidateAdminQueue,
	UpholdDisputeDocument,
} from "#/graphql/admin/queue/mutations"
import { useGqlMutation } from "#/graphql/hooks"

export function UpholdButton({ disputeId }: { disputeId: string }) {
	const queryClient = useQueryClient()
	const upholdDispute = useGqlMutation(UpholdDisputeDocument)

	return (
		<Button
			variant="outline"
			size="sm"
			loading={upholdDispute.isPending}
			onClick={async () => {
				const data = await upholdDispute.mutateAsync({ input: { disputeId } })
				if (data?.upholdDispute.__typename === "ResolutionDispute") {
					await invalidateAdminQueue(queryClient)
				}
			}}
		>
			Uphold
		</Button>
	)
}
