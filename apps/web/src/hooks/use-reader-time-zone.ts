import { useSyncExternalStore } from "react"
import { useTimeZone } from "#/hooks/use-me"
import { browserTimeZone } from "#/lib/time-zone"

const subscribeNever = () => () => {}

// The reader's own zone.
//
// SSR renders in the zone the request's cookie named (see lib/time-zone.ts),
// and hydration has to reproduce that exact text. useSyncExternalStore hands
// hydration the server's zone and only then re-renders with the browser's,
// which is the same zone on every visit after the first. On the first, the
// server had no cookie to go on, so the sports zone shows until hydration.
export function useReaderTimeZone(): string {
	const timeZone = useTimeZone()
	return useSyncExternalStore(subscribeNever, browserTimeZone, () => timeZone)
}
