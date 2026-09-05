import { useQueryClient } from "@tanstack/react-query"
import { useNavigate, useRouter } from "@tanstack/react-router"
import { useGqlMutation } from "#/graphql/hooks"
import { SignOutDocument } from "#/graphql/mutations/auth"
import { track } from "#/lib/analytics"

export function useSignOut() {
	const signOutMutation = useGqlMutation(SignOutDocument)
	const router = useRouter()
	const queryClient = useQueryClient()
	const navigate = useNavigate()

	async function signOut() {
		await signOutMutation.mutateAsync()
		track("user_signed_out", {})
		queryClient.clear()
		await router.invalidate()
		navigate({ to: "/" })
	}

	return { signOut }
}
