import type { CreateGroupInput } from "@called-my-shot/schemas"
import { useQueryClient } from "@tanstack/react-query"
import { useNavigate, useRouter } from "@tanstack/react-router"
import { CreateGroupDocument } from "#/graphql/generated/graphql"
import { invalidateGroups } from "#/graphql/groups/mutations"
import { useGqlMutation } from "#/graphql/hooks"
import { type GroupCreatedSurface, track } from "#/lib/analytics"
import { markFreshGroup } from "#/stores/fresh-group-store"

// Creating a group and moving to it, shared by the in-app modal, the landing
// page's form, and a creation resumed after Google signup. Returns the
// mutation's result so a form can map a ValidationError onto its fields; a
// created group has already been navigated to by then.
export function useCreateGroupFlow() {
	const createGroup = useGqlMutation(CreateGroupDocument)
	const router = useRouter()
	const queryClient = useQueryClient()
	const navigate = useNavigate()

	async function run(input: CreateGroupInput, surface: GroupCreatedSurface) {
		const data = await createGroup.mutateAsync({ input })
		const result = data?.createGroup ?? null
		if (result?.__typename === "GroupPayload") {
			track("group_created", { groupId: result.group.id, surface })
			markFreshGroup(result.group.id)
			await invalidateGroups(queryClient)
			await router.invalidate()
			await navigate({
				to: "/groups/$groupId",
				params: { groupId: result.group.id },
			})
		}
		return result
	}

	return { createGroup: run, isPending: createGroup.isPending }
}
