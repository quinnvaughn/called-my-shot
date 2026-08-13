import { useEffect, useState } from "react"

// Ticks a re-render every `intervalMs` so relative-time text (e.g. a "locks
// in..." countdown) stays current without a full page refresh. Pass `null`
// for text that's already static (resolved/locked) - skips the interval
// entirely instead of ticking a clock nothing reads.
export function useNow(intervalMs: number | null): number {
	const [now, setNow] = useState(() => Date.now())

	useEffect(() => {
		if (intervalMs === null) return
		const id = setInterval(() => setNow(Date.now()), intervalMs)
		return () => clearInterval(id)
	}, [intervalMs])

	return now
}
