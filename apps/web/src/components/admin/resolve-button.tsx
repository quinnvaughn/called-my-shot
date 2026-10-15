import { useQueryClient } from "@tanstack/react-query"
import { Button } from "#/components/ui/button"
import { gqlQueryOptions } from "#/graphql/query-options"
import { QuestionDetailDocument } from "#/graphql/questions/queries"
import { toQuestionForResolve } from "#/lib/question-for-resolve"
import { openModal } from "#/stores/modal-store"
import { AdminResolveModal } from "./admin-resolve-modal"

// Loads the option pool on demand rather than requiring every caller (the
// Questions page's full list, the Queue page's needs-resolution list) to
// select it just in case a row's Resolve button gets clicked - most rows
// never do.
export function ResolveButton({ questionId }: { questionId: string }) {
	const queryClient = useQueryClient()

	async function openResolve() {
		const data = await queryClient.query(
			gqlQueryOptions(QuestionDetailDocument, { id: questionId }),
		)
		if (!data?.question) return
		openModal(
			<AdminResolveModal question={toQuestionForResolve(data.question)} />,
		)
	}

	return (
		<Button variant="outline" size="sm" onClick={openResolve}>
			Resolve
		</Button>
	)
}
