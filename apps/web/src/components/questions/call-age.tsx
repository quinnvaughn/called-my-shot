import { useMinuteClock } from "#/hooks/use-minute-clock"
import { useReaderTimeZone } from "#/hooks/use-reader-time-zone"
import { formatCallAge, formatCallTimestamp } from "#/lib/format-date"

// How long ago a call was made ("3h ago"), or its date once that's past a
// week. The exact time is a hover away.
export function CallAge({ iso }: { iso: string }) {
	const zone = useReaderTimeZone()
	const nowMs = useMinuteClock()
	return (
		<time dateTime={iso} title={formatCallTimestamp(iso, zone)}>
			{formatCallAge(iso, nowMs, zone)}
		</time>
	)
}
