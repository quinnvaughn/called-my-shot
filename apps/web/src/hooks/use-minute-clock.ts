import { useSyncExternalStore } from "react"
import { useRenderedAt } from "#/hooks/use-me"

// A clock every relative time on the page shares, ticking once a minute,
// which is the finest unit formatCallAge prints.
let now = Date.now()
const nowListeners = new Set<() => void>()
let nowTimer: ReturnType<typeof setInterval> | undefined

function subscribeNow(listener: () => void) {
	if (nowListeners.size === 0) {
		now = Date.now()
		nowTimer = setInterval(() => {
			now = Date.now()
			for (const l of nowListeners) l()
		}, 60_000)
	}
	nowListeners.add(listener)
	return () => {
		nowListeners.delete(listener)
		if (nowListeners.size === 0) clearInterval(nowTimer)
	}
}

// The same handoff as useReaderTimeZone: hydration renders against the
// moment the server rendered at, so "5m ago" can't come out "6m ago" in the
// browser and fail to match, then the live clock takes over.
export function useMinuteClock(): number {
	const renderedAt = useRenderedAt()
	return useSyncExternalStore(
		subscribeNow,
		() => now,
		() => renderedAt,
	)
}
