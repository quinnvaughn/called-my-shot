import {
	type CalendarLevel,
	type CalendarSide,
	calendarSteps,
	calendarTone,
} from "@called-my-shot/scoring"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { DateTime } from "luxon"
import { useState } from "react"
import { FiChevronLeft, FiChevronRight } from "react-icons/fi"
import { css, cx } from "styled-system/css"
import { Flex, HStack, VStack } from "styled-system/jsx"
import { Card } from "#/components/ui/card"
import { StepButton } from "#/components/ui/step-button"
import { type FragmentType, graphql, useFragment } from "#/graphql/generated"
import type { ResultsCalendar_CalendarFragment } from "#/graphql/generated/graphql"
import { UserRecordCalendarDocument } from "#/graphql/queries/user"
import { gqlQueryOptions } from "#/graphql/query-options"
import { formatRecord, formatSignedPoints } from "#/lib/ballot-entry"
import { pluralize } from "#/lib/pluralize"
import { gradeTone, reportCardPath } from "#/lib/report-card"

export const ResultsCalendarFragment = graphql(`
	fragment ResultsCalendar_calendar on RecordCalendar {
		startDay
		endDay
		firstDay
		activeDays
		callCount
		days {
			day
			settledCount
			wins
			losses
			pendingCount
			netPoints
			grade
			leagues {
				league {
					id
					abbreviation
					slug
				}
				windowKey
				settledCount
				wins
				losses
				pendingCount
				netPoints
			}
		}
	}
`)

type CalendarDay = ResultsCalendar_CalendarFragment["days"][number]

type Props = {
	// The span ending today. Earlier spans are fetched as the viewer pages
	// back, at the same number of weeks.
	calendar: FragmentType<typeof ResultsCalendarFragment>
	username: string
	// The league slug the calendar is scoped to, null for the whole career.
	league?: string | null
	// Tighter padding, for a narrow column like Home's right rail.
	compact?: boolean
}

// The largest a square gets, in px. In a column wider than the span needs,
// the grid stops growing here and the picked day's detail moves beside it.
const MAX_CELL_PX = 44
// Matches the grid's gap of "1".
const CELL_GAP_PX = 4

const recordCalendarQuery = (
	username: string,
	league: string | null,
	weeks: number,
	page: number,
) =>
	gqlQueryOptions(UserRecordCalendarDocument, {
		username,
		league,
		weeks,
		page,
	})

// One class per shade, written out so Panda can see every one of them. The
// opacities match the og:image's blend over the card surface (see
// share-cards/profile-card.ts in the api), so the page and its unfurl shade a
// day alike.
const TONE_CLASS: Record<`${CalendarSide}${CalendarLevel}`, string> = {
	up1: css({ bg: "success.default/35" }),
	up2: css({ bg: "success.default/55" }),
	up3: css({ bg: "success.default/80" }),
	up4: css({ bg: "success.default" }),
	down1: css({ bg: "danger.default/35" }),
	down2: css({ bg: "danger.default/55" }),
	down3: css({ bg: "danger.default/80" }),
	down4: css({ bg: "danger.default" }),
	even1: css({ bg: "fg.subtle" }),
	even2: css({ bg: "fg.subtle" }),
	even3: css({ bg: "fg.subtle" }),
	even4: css({ bg: "fg.subtle" }),
	pending1: css({
		bg: "bg.subtle",
		border: "2px solid {colors.border.emphasized}",
	}),
	pending2: css({
		bg: "bg.subtle",
		border: "2px solid {colors.border.emphasized}",
	}),
	pending3: css({
		bg: "bg.subtle",
		border: "2px solid {colors.border.emphasized}",
	}),
	pending4: css({
		bg: "bg.subtle",
		border: "2px solid {colors.border.emphasized}",
	}),
}

const cellBase = css({
	aspectRatio: "1",
	borderRadius: "xs",
	minWidth: "0",
})

const emptyCell = css({ bg: "bg.subtle" })

const mono = css({
	fontFamily: "mono",
	fontSize: "2xs",
	letterSpacing: "wide",
	color: "fg.muted",
	textTransform: "uppercase",
})

// Month labels skip a change that lands within this many columns of the
// previous label, so two short labels never collide.
const MIN_LABEL_GAP = 3

function dayLabel(day: string): string {
	return DateTime.fromISO(day).toFormat("ccc LLL d")
}

// "Aug 9 – Oct 3", with the year on whichever end needs it: both ends of a
// span crossing New Year, and the end of any span outside the current year.
function rangeLabel(startDay: string, endDay: string, today: string): string {
	const start = DateTime.fromISO(startDay)
	const end = DateTime.fromISO(endDay)
	const endFormat =
		end.year === DateTime.fromISO(today).year ? "LLL d" : "LLL d, yyyy"
	const startFormat = start.year === end.year ? "LLL d" : "LLL d, yyyy"
	return `${start.toFormat(startFormat)} – ${end.toFormat(endFormat)}`
}

function spanWeeks(startDay: string, endDay: string): number {
	const days =
		Math.floor(
			DateTime.fromISO(endDay).diff(DateTime.fromISO(startDay), "days").days,
		) + 1
	return Math.ceil(days / 7)
}

function signedTone(points: number): string {
	return points > 0
		? css({ color: "success.default" })
		: points < 0
			? css({ color: "danger.default" })
			: css({ color: "fg.default" })
}

// A short span's grid and the picked day stack in a narrow column and sit
// side by side once there's room for both, measured against the card rather
// than the viewport, since the same calendar renders in a phone-width column,
// a main column and a rail. ROW_MIN_PX is ROW_LAYOUT's threshold.
const ROW_LAYOUT = "@container (min-width: 40rem)"
const ROW_MIN_PX = 640
const ROW_GAP_PX = 16
// The narrowest the picked day's detail gets beside the grid.
const DETAIL_MIN_PX = 240

const rowLayout = css({
	[ROW_LAYOUT]: { flexDirection: "row", alignItems: "flex-start" },
})

const detailBeside = css({
	[ROW_LAYOUT]: {
		alignSelf: "stretch",
		borderTop: "none",
		paddingTop: "0",
		borderLeft: "1px solid {colors.border.default}",
		paddingLeft: "4",
	},
})

// GitHub's contribution grid, for calls: a column per week, Sunday on top,
// one square per day. Green for a day that netted points, red for one that
// lost them, darker for a bigger day by this caller's own standards. Picking
// a square opens that day beside or below the grid, with a link to each
// league's report card for it.
//
// Pages back through earlier spans of the same length as the one it opened
// with. Paging back stops at the span
// holding the first call in scope.
export function ResultsCalendar({
	calendar: calendarProp,
	username,
	league = null,
	compact = false,
}: Props) {
	const current = useFragment(ResultsCalendarFragment, calendarProp)
	const weeks = spanWeeks(current.startDay, current.endDay)
	const [page, setPage] = useState(0)
	const { data, isPlaceholderData } = useQuery({
		...recordCalendarQuery(username, league, weeks, page),
		enabled: page > 0,
		placeholderData: keepPreviousData,
	})
	const fetched = data?.userByUsername?.record?.calendar
	// Until an earlier span arrives, the one already on screen stays up, and
	// both buttons wait for it.
	const loading = page > 0 && (!fetched || isPlaceholderData)
	const calendar = useFragment(
		ResultsCalendarFragment,
		page > 0 && fetched ? fetched : calendarProp,
	)

	const byDay = new Map(calendar.days.map((day) => [day.day, day]))
	const steps = calendarSteps(calendar.days)
	const latest = calendar.days.at(-1)?.day ?? null
	const [selected, setSelected] = useState<string | null>(null)
	const [hovered, setHovered] = useState<string | null>(null)
	// Each span opens on its own latest day.
	const picked = selected !== null && byDay.has(selected) ? selected : latest

	function step(delta: 1 | -1) {
		setPage((p) => Math.max(p + delta, 0))
		setSelected(null)
	}

	const canGoOlder =
		calendar.firstDay !== null && calendar.firstDay < calendar.startDay

	const start = DateTime.fromISO(calendar.startDay)
	const end = DateTime.fromISO(calendar.endDay)
	const dayCount = Math.floor(end.diff(start, "days").days) + 1
	const columnCount = Math.ceil(dayCount / 7)
	const dates = Array.from(
		{ length: dayCount },
		(_, i) => start.plus({ days: i }).toISODate() ?? "",
	)

	const monthLabels: (string | null)[] = []
	let lastMonth: number | null = null
	let lastLabeled = Number.NEGATIVE_INFINITY
	for (let week = 0; week < columnCount; week++) {
		const weekEnd = start.plus({ weeks: week, days: 6 })
		const changed = weekEnd.month !== lastMonth
		lastMonth = weekEnd.month
		if (changed && week - lastLabeled >= MIN_LABEL_GAP) {
			monthLabels.push(weekEnd.toFormat("LLL"))
			lastLabeled = week
		} else {
			monthLabels.push(null)
		}
	}

	const columns = {
		gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))`,
	}
	const gridMaxWidth =
		columnCount * MAX_CELL_PX + (columnCount - 1) * CELL_GAP_PX
	// A long span fills the card at any width, leaving nothing beside it, so
	// its detail always sits below.
	const besideGrid = gridMaxWidth + ROW_GAP_PX + DETAIL_MIN_PX <= ROW_MIN_PX
	const shown = byDay.get(hovered ?? picked ?? "")
	const hasPending = calendar.days.some(
		(day) => day.settledCount === 0 && day.pendingCount > 0,
	)

	return (
		<Card variant="surface" size={compact ? "sm" : "md"}>
			<Card.Body>
				<VStack alignItems="stretch" gap="4">
					<HStack justify="space-between" alignItems="flex-start" gap="3">
						<VStack alignItems="flex-start" gap="0.5">
							<span className={mono}>
								{rangeLabel(calendar.startDay, calendar.endDay, current.endDay)}
							</span>
							<span className={css({ fontSize: "sm", color: "fg.body" })}>
								{calendar.callCount.toLocaleString()}{" "}
								{pluralize(calendar.callCount, "call")} on{" "}
								{calendar.activeDays} {pluralize(calendar.activeDays, "day")}
							</span>
						</VStack>
						<HStack gap="1.5" flexShrink="0">
							<StepButton
								label={`Previous ${weeks} weeks`}
								disabled={loading || !canGoOlder}
								onClick={() => step(1)}
							>
								<FiChevronLeft aria-hidden />
							</StepButton>
							<StepButton
								label={`Next ${weeks} weeks`}
								disabled={loading || page === 0}
								onClick={() => step(-1)}
							>
								<FiChevronRight aria-hidden />
							</StepButton>
						</HStack>
					</HStack>

					<div className={css({ containerType: "inline-size" })}>
						<div
							className={cx(
								css({ display: "flex", flexDirection: "column", gap: "4" }),
								besideGrid && rowLayout,
							)}
						>
							<VStack
								alignItems="stretch"
								gap="3"
								className={css({ width: "full", flexShrink: "0" })}
								style={{ maxWidth: gridMaxWidth }}
							>
								<VStack alignItems="stretch" gap="1.5">
									<div
										aria-hidden
										className={css({ display: "grid", gap: "1" })}
										style={columns}
									>
										{monthLabels.map((label, week) => (
											<span
												// biome-ignore lint/suspicious/noArrayIndexKey: one label slot per week column, fixed order
												key={week}
												className={cx(mono, css({ whiteSpace: "nowrap" }))}
											>
												{label}
											</span>
										))}
									</div>
									<div
										className={css({
											display: "grid",
											gridTemplateRows: "repeat(7, auto)",
											gridAutoFlow: "column",
											gap: "1",
										})}
										style={columns}
									>
										{dates.map((date) => {
											const day = byDay.get(date)
											if (!day) {
												return (
													<div key={date} className={cx(cellBase, emptyCell)} />
												)
											}
											const tone = calendarTone(day, steps)
											const isSelected = picked === date
											return (
												<button
													key={date}
													type="button"
													aria-pressed={isSelected}
													aria-label={`${dayLabel(date)}: ${formatSignedPoints(day.netPoints)} points, ${formatRecord(day.wins, day.losses)}`}
													onClick={() => setSelected(date)}
													onMouseEnter={() => setHovered(date)}
													onMouseLeave={() => setHovered(null)}
													onFocus={() => setHovered(date)}
													onBlur={() => setHovered(null)}
													className={cx(
														cellBase,
														TONE_CLASS[`${tone.side}${tone.level}`],
														css({
															cursor: "pointer",
															_hover: {
																outline: "2px solid {colors.fg.default}",
															},
															_focusVisible: {
																outline: "2px solid {colors.primary.default}",
															},
														}),
														isSelected &&
															css({ outline: "2px solid {colors.fg.default}" }),
													)}
												/>
											)
										})}
									</div>
								</VStack>
								<Legend hasPending={hasPending} />
							</VStack>

							<div
								className={cx(
									css({
										flex: "1",
										minWidth: "0",
										borderTop: "1px solid {colors.border.default}",
										paddingTop: "3",
									}),
									besideGrid && detailBeside,
								)}
							>
								{shown ? (
									<DayDetail day={shown} username={username} />
								) : (
									<span className={css({ fontSize: "sm", color: "fg.muted" })}>
										No calls in this stretch.
									</span>
								)}
							</div>
						</div>
					</div>
				</VStack>
			</Card.Body>
		</Card>
	)
}

function Swatch({ className }: { className: string }) {
	return (
		<span
			className={cx(
				css({
					display: "inline-block",
					width: "3",
					height: "3",
					borderRadius: "xs",
				}),
				className,
			)}
		/>
	)
}

function Legend({ hasPending }: { hasPending: boolean }) {
	return (
		<HStack gap="3" flexWrap="wrap" className={mono}>
			<HStack gap="1">
				<Swatch className={TONE_CLASS.up2} />
				<Swatch className={TONE_CLASS.up4} />
				<span>Up day</span>
			</HStack>
			<HStack gap="1">
				<Swatch className={TONE_CLASS.down2} />
				<Swatch className={TONE_CLASS.down4} />
				<span>Down day</span>
			</HStack>
			{hasPending && (
				<HStack gap="1">
					<Swatch className={TONE_CLASS.pending1} />
					<span>Pending</span>
				</HStack>
			)}
		</HStack>
	)
}

function DayDetail({ day, username }: { day: CalendarDay; username: string }) {
	return (
		<VStack alignItems="stretch" gap="2">
			<Flex justify="space-between" alignItems="baseline" gap="3" wrap="wrap">
				<span className={mono}>{dayLabel(day.day)}</span>
				<HStack gap="3" className={css({ fontFamily: "mono", fontSize: "sm" })}>
					{day.settledCount > 0 && (
						<>
							<span className={signedTone(day.netPoints)}>
								{formatSignedPoints(day.netPoints)} pts
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
					{day.pendingCount > 0 && (
						<span className={css({ color: "fg.muted" })}>
							{day.pendingCount} pending
						</span>
					)}
				</HStack>
			</Flex>
			{day.leagues.map((entry) => (
				<Flex
					key={entry.league.id}
					justify="space-between"
					alignItems="center"
					gap="3"
					className={css({ fontSize: "sm" })}
				>
					<HStack gap="3" className={css({ fontFamily: "mono" })}>
						<span className={css({ color: "fg.default", minWidth: "10" })}>
							{entry.league.abbreviation.toUpperCase()}
						</span>
						{entry.settledCount > 0 && (
							<span className={signedTone(entry.netPoints)}>
								{formatSignedPoints(entry.netPoints)}
							</span>
						)}
						{entry.settledCount > 0 && (
							<span className={css({ color: "fg.muted" })}>
								{formatRecord(entry.wins, entry.losses)}
							</span>
						)}
					</HStack>
					{entry.windowKey && (
						<Link
							to={reportCardPath(username, entry.league.slug, entry.windowKey)}
							className={css({
								fontSize: "xs",
								color: "primary.default",
								whiteSpace: "nowrap",
								_hover: { textDecoration: "underline" },
							})}
						>
							Report card
						</Link>
					)}
				</Flex>
			))}
		</VStack>
	)
}

function GradeText({ grade }: { grade: string }) {
	const tone = gradeTone(grade)
	return (
		<span
			className={
				tone === "success.default"
					? css({ color: "success.default" })
					: tone === "danger.default"
						? css({ color: "danger.default" })
						: css({ color: "fg.default" })
			}
		>
			{grade}
		</span>
	)
}
