import { FiClock } from "react-icons/fi"
import { css } from "styled-system/css"
import { HStack } from "styled-system/jsx"
import { signTone } from "#/components/ui/sign-tone"
import { formatSigned } from "#/lib/format-number"
import { formatRecord } from "#/lib/game-status"
import type { CalendarDay } from "./types"

type DayLeague = CalendarDay["leagues"][number]

export function CalendarLeagueStats({ entry }: { entry: DayLeague }) {
	return (
		<HStack gap="3" className={css({ fontFamily: "mono" })}>
			<span className={css({ color: "fg.default", minWidth: "10" })}>
				{entry.league.abbreviation.toUpperCase()}
			</span>
			{entry.settledCount > 0 && (
				<span className={signTone(entry.netPoints)}>
					{formatSigned(entry.netPoints, { zeroSign: true })}
				</span>
			)}
			{entry.settledCount > 0 && (
				<span className={css({ color: "fg.muted" })}>
					{formatRecord(entry.wins, entry.losses)}
				</span>
			)}
			{/* A clock and the count rather than "N pending", which would crowd
			    a row that also has points and a record in a column as narrow
			    as the rail. */}
			{entry.pendingCount > 0 && (
				<HStack
					gap="1"
					title={`${entry.pendingCount} pending`}
					className={css({ color: "fg.muted" })}
				>
					<FiClock aria-hidden size={12} />
					<span aria-hidden>{entry.pendingCount}</span>
					<span className={css({ srOnly: true })}>
						{entry.pendingCount} pending
					</span>
				</HStack>
			)}
		</HStack>
	)
}
