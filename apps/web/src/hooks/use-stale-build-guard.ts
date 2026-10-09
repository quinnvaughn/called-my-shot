import { useRouter } from "@tanstack/react-router"
import { useEffect } from "react"

const BUILD_ID = import.meta.env.VITE_BUILD_ID as string | undefined

// Route components ship as content-hashed chunks, and a deploy replaces them
// wholesale. A tab loaded before the deploy still points at the old hashes, so
// its next client-side navigation imports a file that 404s. The router
// recovers by reloading the page, but only after that navigation has already
// failed on screen. Checking the live build first and turning the navigation
// into a full page load means the missing chunk is never requested.
//
// Checked lazily rather than polled: an idle tab is the one that goes stale,
// so only the first navigation after this long pays the round trip.
const RECHECK_AFTER_MS = 60_000
// A slow or failed check lets the navigation through as a normal client-side
// one. Worst case is the router's own reload, never a stuck click.
const CHECK_TIMEOUT_MS = 1_500

async function fetchLiveBuildId(): Promise<string | null> {
	try {
		const response = await fetch("/version", {
			cache: "no-store",
			signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
		})
		if (!response.ok) return null
		return (await response.text()).trim() || null
	} catch {
		return null
	}
}

export function useStaleBuildGuard() {
	const router = useRouter()

	useEffect(() => {
		if (!BUILD_ID) return
		// The page was served moments ago, so it starts out current.
		let checkedAt = Date.now()
		let stale = false

		return router.history.block({
			// A registered blocker otherwise opts the tab into the browser's
			// "leave site?" prompt on every close and reload.
			enableBeforeUnload: false,
			blockerFn: async ({ nextLocation, action }) => {
				if (!stale && Date.now() - checkedAt > RECHECK_AFTER_MS) {
					checkedAt = Date.now()
					const liveBuildId = await fetchLiveBuildId()
					stale = liveBuildId !== null && liveBuildId !== BUILD_ID
				}
				if (!stale) return false
				// Back/forward has already moved the address bar by the time this
				// runs, so reloading lands on the new entry. Blocking it instead
				// would make history step forward again, which cancels the page
				// load and leaves the tab stuck where it was.
				if (action !== "PUSH" && action !== "REPLACE") {
					window.location.reload()
					return false
				}
				if (action === "REPLACE") window.location.replace(nextLocation.href)
				else window.location.assign(nextLocation.href)
				return true
			},
		})
	}, [router])
}
