import { useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { match } from "ts-pattern"
import { useGqlMutation } from "#/graphql/hooks"
import {
	SetGroupPinOrderDocument,
	UnpinQuestionFromGroupDocument,
} from "#/graphql/mutations/groups"

// Reordering and unpinning, shared by the pinned strip on the group page and
// the Welcome section in settings. Invalidates only the two group queries
// that show pins, so whichever surface is open keeps its own state.
export function useGroupPinActions(groupId: string) {
	const queryClient = useQueryClient()
	const setOrder = useGqlMutation(SetGroupPinOrderDocument)
	const unpinMutation = useGqlMutation(UnpinQuestionFromGroupDocument)
	const [error, setError] = useState<string | null>(null)

	async function refresh() {
		await Promise.all([
			queryClient.invalidateQueries({ queryKey: ["GroupDetail"] }),
			queryClient.invalidateQueries({ queryKey: ["GroupSettings"] }),
		])
	}

	type Result =
		| { __typename: "GroupPayload" }
		| {
				__typename:
					| "AuthenticationError"
					| "AuthorizationError"
					| "NotFoundError"
					| "ValidationError"
				message: string
		  }

	async function handle(result: Result | null | undefined) {
		if (!result) {
			setError("Something went wrong. Try again.")
			return
		}
		await match(result)
			.with({ __typename: "GroupPayload" }, async () => {
				await refresh()
			})
			.with(
				{ __typename: "AuthenticationError" },
				{ __typename: "AuthorizationError" },
				{ __typename: "NotFoundError" },
				{ __typename: "ValidationError" },
				async (r) => {
					setError(r.message)
					// The set changed under the viewer (a pin locked, another
					// admin reordered), so show them what's there now.
					await refresh()
				},
			)
			.exhaustive()
	}

	// Moves the pin at `from` to `to` within the current order.
	async function move(questionIds: string[], from: number, to: number) {
		if (to < 0 || to >= questionIds.length || from === to) return
		setError(null)
		const next = [...questionIds]
		const [moved] = next.splice(from, 1)
		next.splice(to, 0, moved)
		const data = await setOrder.mutateAsync({ groupId, questionIds: next })
		await handle(data?.setGroupPinOrder)
	}

	async function unpin(questionId: string) {
		setError(null)
		const data = await unpinMutation.mutateAsync({ groupId, questionId })
		await handle(data?.unpinQuestionFromGroup)
	}

	return {
		move,
		unpin,
		pending: setOrder.isPending || unpinMutation.isPending,
		error,
	}
}
