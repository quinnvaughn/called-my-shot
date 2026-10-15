import { useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { match } from "ts-pattern"
import { ApiError } from "#/graphql/api-error"
import {
	invalidateGroupBoards,
	SetGroupPinOrderDocument,
	UnpinQuestionFromGroupDocument,
} from "#/graphql/groups/mutations"
import { useGqlMutation } from "#/graphql/hooks"

// Reordering and unpinning, shared by the pinned strip on the group page and
// the Pins section in settings. Invalidates only the two group queries
// that show pins, so whichever surface is open keeps its own state.
export function useGroupPinActions(groupId: string) {
	const queryClient = useQueryClient()
	const setOrder = useGqlMutation(SetGroupPinOrderDocument)
	const unpinQuestion = useGqlMutation(UnpinQuestionFromGroupDocument)
	const [error, setError] = useState<string | null>(null)

	async function refresh() {
		await invalidateGroupBoards(queryClient, groupId)
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
			.with(ApiError, { __typename: "ValidationError" }, async (r) => {
				setError(r.message)
				// The set changed under the viewer (a pin locked, another
				// admin reordered), so show them what's there now.
				await refresh()
			})
			.exhaustive()
	}

	// Moves the pin at `from` to `to` within the current order.
	async function move(pinIds: string[], from: number, to: number) {
		if (to < 0 || to >= pinIds.length || from === to) return
		setError(null)
		const next = [...pinIds]
		const [moved] = next.splice(from, 1)
		next.splice(to, 0, moved)
		const data = await setOrder.mutateAsync({ groupId, pinIds: next })
		await handle(data?.setGroupPinOrder)
	}

	async function unpin(questionId: string) {
		setError(null)
		const data = await unpinQuestion.mutateAsync({ groupId, questionId })
		await handle(data?.unpinQuestionFromGroup)
	}

	return {
		move,
		unpin,
		pending: setOrder.isPending || unpinQuestion.isPending,
		error,
	}
}
