import { AuthModal } from "#/components/auth/auth-modal"
import { useMe } from "#/hooks/use-me"
import type {
	AuthModalCopyOverride,
	AuthModalSurface,
} from "#/lib/auth-modal-copy"
import type { AuthIntent } from "#/stores/auth-intent-store"
import { openModal } from "#/stores/modal-store"

type Options = {
	// The callback written down, so a Google signup can finish it after
	// leaving the page and coming back (see AuthModal).
	intent?: AuthIntent
	surface?: AuthModalSurface
}

// Gate a single action behind auth: run the callback if signed in, otherwise
// open the sign-up modal instead of running it. Pass `copy` to explain *why*
// auth is required for this specific action (e.g. joining a group).
export function useRequireAuth() {
	const me = useMe()

	return (
		callback: () => void,
		copy?: AuthModalCopyOverride,
		options?: Options,
	) => {
		if (me) {
			callback()
			return
		}
		openModal(
			<AuthModal
				defaultView="signup"
				copy={copy}
				onSuccess={callback}
				intent={options?.intent}
				surface={options?.surface}
			/>,
		)
	}
}
