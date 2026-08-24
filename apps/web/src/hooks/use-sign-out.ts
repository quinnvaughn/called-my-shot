import { useMutation } from "@apollo/client/react"
import { useNavigate, useRouter } from "@tanstack/react-router"
import { SignOutDocument } from "#/graphql/mutations/auth"
import { track } from "#/lib/analytics"

export function useSignOut() {
	const [signOutMutation] = useMutation(SignOutDocument)
	const router = useRouter()
	const navigate = useNavigate()

	async function signOut() {
		await signOutMutation()
		track("user_signed_out", {})
		await router.invalidate()
		navigate({ to: "/" })
	}

	return { signOut }
}
