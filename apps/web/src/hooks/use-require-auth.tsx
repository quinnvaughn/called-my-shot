import { useRouteContext } from "@tanstack/react-router"
import { AuthModal } from "#/components/auth/auth-modal"
import { openModal } from "#/stores/modal-store"

// Gate a single action behind auth: run the callback if signed in, otherwise
// open the sign-up modal instead of running it.
export function useRequireAuth() {
	const { me } = useRouteContext({ from: "__root__" })

	return (callback: () => void) => {
		if (me) {
			callback()
			return
		}
		openModal(<AuthModal defaultView="signup" onSuccess={callback} />)
	}
}
