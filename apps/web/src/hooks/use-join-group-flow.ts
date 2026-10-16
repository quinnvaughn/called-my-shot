import { useQueryClient } from "@tanstack/react-query"
import { useNavigate, useRouter } from "@tanstack/react-router"
import { JoinGroupByCodeDocument } from "#/graphql/generated/graphql"
import { invalidateGroups } from "#/graphql/groups/mutations"
import { useGqlMutation } from "#/graphql/hooks"
import { track } from "#/lib/analytics"
import { requestPushPrompt } from "#/stores/push-prompt-store"

// Joining from an invite link and moving to the group, shared by the invite
// page's Join button and a join resumed after Google signup.
export function useJoinGroupFlow() {
	const joinGroupByCode = useGqlMutation(JoinGroupByCodeDocument)
	const router = useRouter()
	const queryClient = useQueryClient()
	const navigate = useNavigate()

	async function run(code: string, { resumedAfterGoogle = false } = {}) {
		const data = await joinGroupByCode.mutateAsync({ input: { code } })
		const result = data?.joinGroupByCode
		if (result?.__typename !== "GroupPayload") return

		track("group_joined", {
			groupId: result.group.id,
			source: "invite_link",
			resumedAfterGoogle,
		})
		requestPushPrompt("group_joined")
		await invalidateGroups(queryClient)
		await router.invalidate()
		await navigate({
			to: "/groups/$groupId",
			params: { groupId: result.group.id },
		})
	}

	return { joinGroup: run, isPending: joinGroupByCode.isPending }
}
