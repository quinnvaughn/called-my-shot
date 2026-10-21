import { useQueryClient } from "@tanstack/react-query"
import { useNavigate, useRouter } from "@tanstack/react-router"
import {
	JoinGroupByCodeDocument,
	JoinGroupByRecapDocument,
} from "#/graphql/generated/graphql"
import { invalidateGroups } from "#/graphql/groups/mutations"
import { useGqlMutation } from "#/graphql/hooks"
import { track } from "#/lib/analytics"
import { requestPushPrompt } from "#/stores/push-prompt-store"

// Joining from an invite link or a recap's link and moving to the group,
// shared by the Join buttons on those pages and a join resumed after Google
// signup.
export function useJoinGroupFlow() {
	const joinGroupByCode = useGqlMutation(JoinGroupByCodeDocument)
	const joinGroupByRecap = useGqlMutation(JoinGroupByRecapDocument)
	const router = useRouter()
	const queryClient = useQueryClient()
	const navigate = useNavigate()

	async function run(code: string, { resumedAfterGoogle = false } = {}) {
		const data = await joinGroupByCode.mutateAsync({ input: { code } })
		const result = data?.joinGroupByCode
		if (result?.__typename !== "GroupPayload") return
		await enter(result.group.id, "invite_link", resumedAfterGoogle)
	}

	async function runFromRecap(
		token: string,
		{ resumedAfterGoogle = false } = {},
	) {
		const data = await joinGroupByRecap.mutateAsync({ token })
		const result = data?.joinGroupByRecap
		if (result?.__typename !== "GroupPayload") return
		await enter(result.group.id, "recap_link", resumedAfterGoogle)
	}

	async function enter(
		groupId: string,
		source: "invite_link" | "recap_link",
		resumedAfterGoogle: boolean,
	) {
		track("group_joined", { groupId, source, resumedAfterGoogle })
		requestPushPrompt("group_joined")
		await invalidateGroups(queryClient)
		await router.invalidate()
		await navigate({ to: "/groups/$groupId", params: { groupId } })
	}

	return {
		joinGroup: run,
		joinGroupFromRecap: runFromRecap,
		isPending: joinGroupByCode.isPending || joinGroupByRecap.isPending,
	}
}
