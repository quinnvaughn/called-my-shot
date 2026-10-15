import { Link } from "@tanstack/react-router"
import { FiChevronRight } from "react-icons/fi"
import { css, cx } from "styled-system/css"
import { Flex, HStack, VStack } from "styled-system/jsx"
import { signTone } from "#/components/ui/sign-tone"
import { formatSigned } from "#/lib/format-number"
import { formatRecord } from "#/lib/game-status"
import { reportCardPath } from "#/lib/report-card"
import { dayLabel } from "#/lib/results-calendar"
import { CalendarLeagueStats } from "./calendar-league-stats"
import { GradeText } from "./grade-text"
import { mono } from "./styles"
import type { CalendarDay } from "./types"

// Shared by a league's row whether or not it links, so the two line up.
const leagueRow = css({
	display: "flex",
	justifyContent: "space-between",
	alignItems: "center",
	gap: "3",
	minHeight: "10",
	paddingInline: "3",
	paddingBlock: "2",
	borderRadius: "md",
	fontSize: "sm",
})

export function CalendarDayDetail({
	day,
	username,
}: {
	day: CalendarDay
	username: string
}) {
	return (
		<VStack alignItems="stretch" gap="2">
			<Flex justify="space-between" alignItems="baseline" gap="3" wrap="wrap">
				<span className={mono}>{dayLabel(day.day)}</span>
				<HStack gap="3" className={css({ fontFamily: "mono", fontSize: "sm" })}>
					{day.settledCount > 0 && (
						<>
							<span className={signTone(day.netPoints)}>
								{formatSigned(day.netPoints, { zeroSign: true })} pts
							</span>
							<span className={css({ color: "fg.body" })}>
								{formatRecord(day.wins, day.losses)}
							</span>
						</>
					)}
					{day.grade && (
						<span className={css({ fontWeight: "semibold" })}>
							<GradeText grade={day.grade} />
						</span>
					)}
				</HStack>
			</Flex>
			{day.leagues.map((entry) => {
				// The whole row is the way to that league's report card for the
				// day, so it's drawn as a button. A row with no report card (only
				// calls on no single game) stays plain text.
				return entry.windowKey ? (
					<Link
						key={entry.league.id}
						to={reportCardPath(username, entry.league.slug, entry.windowKey)}
						className={cx(
							leagueRow,
							css({
								bg: "bg.subtle",
								border: "1px solid {colors.border.default}",
								transition: "border-color 0.15s ease",
								_hover: { border: "1px solid {colors.border.emphasized}" },
								_focusVisible: {
									outline: "2px solid {colors.primary.default}",
									outlineOffset: "2px",
								},
							}),
						)}
					>
						<CalendarLeagueStats entry={entry} />
						<span className={css({ srOnly: true })}>report card</span>
						<FiChevronRight
							aria-hidden
							className={css({ color: "primary.default", flexShrink: "0" })}
						/>
					</Link>
				) : (
					<div
						key={entry.league.id}
						className={cx(leagueRow, css({ border: "1px solid transparent" }))}
					>
						<CalendarLeagueStats entry={entry} />
					</div>
				)
			})}
		</VStack>
	)
}
