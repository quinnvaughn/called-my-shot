import { useRouteContext } from "@tanstack/react-router"
import type { AuthModalCopyOverride } from "#/components/auth/auth-modal"
import { AuthModal } from "#/components/auth/auth-modal"
import { openModal } from "#/stores/modal-store"

// Gate a single action behind auth: run the callback if signed in, otherwise
// open the sign-up modal instead of running it. Pass `copy` to explain *why*
// auth is required for this specific action (e.g. joining a group).
export function useRequireAuth() {
	const { me } = useRouteContext({ from: "__root__" })

	return (callback: () => void, copy?: AuthModalCopyOverride) => {
		if (me) {
			callback()
			return
		}
		openModal(<AuthModal defaultView="signup" copy={copy} onSuccess={callback} />)
	}
}
