import { useMutation } from "@apollo/client/react"
import { useNavigate, useRouter } from "@tanstack/react-router"
import { SignOutDocument } from "#/graphql/mutations/auth"

export function useSignOut() {
	const [signOutMutation] = useMutation(SignOutDocument)
	const router = useRouter()
	const navigate = useNavigate()

	async function signOut() {
		await signOutMutation()
		await router.invalidate()
		navigate({ to: "/" })
	}

	return { signOut }
}
