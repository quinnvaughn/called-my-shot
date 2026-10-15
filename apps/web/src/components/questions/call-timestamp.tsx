import { useReaderTimeZone } from "#/hooks/use-reader-time-zone"
import { formatCallTimestamp } from "#/lib/format-date"

// When a call was made, down to the minute, in the reader's own zone.
export function CallTimestamp({ iso }: { iso: string }) {
	const zone = useReaderTimeZone()
	return <time dateTime={iso}>{formatCallTimestamp(iso, zone)}</time>
}
