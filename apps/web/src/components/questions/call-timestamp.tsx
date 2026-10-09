import { useRouteContext } from "@tanstack/react-router"
import { useSyncExternalStore } from "react"
import { formatCallAge, formatCallTimestamp } from "#/lib/format-date"
import { browserTimeZone } from "#/lib/time-zone"

const subscribeNever = () => () => {}

// The reader's own zone.
//
// SSR renders in the zone the request's cookie named (see lib/time-zone.ts),
// and hydration has to reproduce that exact text. useSyncExternalStore hands
// hydration the server's zone and only then re-renders with the browser's,
// which is the same zone on every visit after the first. On the first, the
// server had no cookie to go on, so the sports zone shows until hydration.
function useReaderTimeZone(): string {
	const { timeZone } = useRouteContext({ from: "__root__" })
	return useSyncExternalStore(subscribeNever, browserTimeZone, () => timeZone)
}

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

// The same handoff as the zone: hydration renders against the moment the
// server rendered at, so "5m ago" can't come out "6m ago" in the browser and
// fail to match, then the live clock takes over.
function useNow(): number {
	const { now: renderedAt } = useRouteContext({ from: "__root__" })
	return useSyncExternalStore(
		subscribeNow,
		() => now,
		() => renderedAt,
	)
}

// When a call was made, down to the minute, in the reader's own zone.
export function CallTimestamp({ iso }: { iso: string }) {
	const zone = useReaderTimeZone()
	return <time dateTime={iso}>{formatCallTimestamp(iso, zone)}</time>
}

// How long ago a call was made ("3h ago"), or its date once that's past a
// week. The exact time is a hover away.
export function CallAge({ iso }: { iso: string }) {
	const zone = useReaderTimeZone()
	const nowMs = useNow()
	return (
		<time dateTime={iso} title={formatCallTimestamp(iso, zone)}>
			{formatCallAge(iso, nowMs, zone)}
		</time>
	)
}
