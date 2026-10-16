import { useQueryClient } from "@tanstack/react-query"
import { useRouter } from "@tanstack/react-router"
import { useEffect } from "react"
import { submitGuestPicks } from "#/lib/submit-guest-picks"

// Posts the landing page's guest picks as soon as there's an account to post
// them from, on whatever page the signup or sign-in landed on: Home, a group
// that was just started or joined, or the page a gated action resumed on.
export function useSubmitGuestPicks(viewerId: string | null) {
	const queryClient = useQueryClient()
	const router = useRouter()

	useEffect(() => {
		if (!viewerId) return
		void submitGuestPicks({ queryClient, router })
	}, [viewerId, queryClient, router])
}
