import { useRouter } from "@tanstack/react-router"
import { useEffect } from "react"
import { useNow } from "#/hooks/use-now"

function untilLabel(ms: number): string {
	const minutes = Math.max(0, Math.ceil(ms / 60_000))
	const hours = Math.floor(minutes / 60)
	const rest = minutes % 60
	return hours > 0 ? `${hours}h ${rest}m` : `${rest}m`
}

// "Next season in 5h 12m". Reloads the page's data when it reaches zero, so the
// new puzzle shows up without a refresh.
export function SeasonCountdown({ nextPuzzleAt }: { nextPuzzleAt: string }) {
	const now = useNow(30_000)
	const router = useRouter()
	const remaining = Date.parse(nextPuzzleAt) - now

	useEffect(() => {
		if (remaining > 0) return
		void router.invalidate()
	}, [remaining, router])

	return <>Next season in {untilLabel(remaining)}</>
}
