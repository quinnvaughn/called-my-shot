import { match } from "ts-pattern"
import type { AuthIntent } from "#/stores/auth-intent-store"
import { showToast } from "#/stores/toast-store"
import { useCreateGroupFlow } from "./use-create-group-flow"
import { useJoinGroupFlow } from "./use-join-group-flow"

// Finishes the action a visitor signed up through Google to do, once they're
// back with an account: the same flows the page would have run in the
// modal's onSuccess had they used email.
export function useResumeAuthIntent() {
	const { createGroup } = useCreateGroupFlow()
	const { joinGroup } = useJoinGroupFlow()

	return (intent: AuthIntent) => {
		match(intent)
			.with({ kind: "create_group" }, async ({ name }) => {
				const result = await createGroup(
					{ name, leagueIds: [] },
					"resume_google",
				)
				if (result?.__typename !== "GroupPayload") {
					showToast({
						message: `${name} didn't get created. Try again from New Group.`,
					})
				}
			})
			.with({ kind: "join_group" }, ({ code }) =>
				joinGroup(code, { resumedAfterGoogle: true }),
			)
			.exhaustive()
	}
}
