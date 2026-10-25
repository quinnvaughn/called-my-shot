import { useState } from "react"
import { useRequireAuth } from "#/hooks/use-require-auth"

type LikeState = { liked: boolean; count: number }

// The heart answers the tap at once and settles on what the server says
// once the reads it touches come back. Signed out, the tap opens sign up.
export function useLikeToggle(
	server: LikeState,
	send: (like: boolean) => Promise<void>,
) {
	const requireAuth = useRequireAuth()
	const [pending, setPending] = useState<LikeState | null>(null)
	const shown = pending ?? server

	function toggle() {
		requireAuth(
			() => {
				const next = {
					liked: !shown.liked,
					count: Math.max(0, shown.count + (shown.liked ? -1 : 1)),
				}
				setPending(next)
				void send(next.liked).finally(() => setPending(null))
			},
			{ signup: { title: "Sign up to like posts and comments" } },
		)
	}

	return { ...shown, toggle }
}
