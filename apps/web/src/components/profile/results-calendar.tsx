import {
	type CalendarLevel,
	type CalendarSide,
	calendarSteps,
	calendarTone,
} from "@called-my-shot/scoring"
import { Link } from "@tanstack/react-router"
import { DateTime } from "luxon"
import { useEffect, useRef, useState } from "react"
import { css, cx } from "styled-system/css"
import { Flex, HStack, VStack } from "styled-system/jsx"
import { Card } from "#/components/ui/card"
import { formatRecord, formatSignedPoints } from "#/lib/ballot-entry"
import { pluralize } from "#/lib/pluralize"
import { gradeTone, reportCardPath } from "#/lib/report-card"

export type CalendarDayLeague = {
	league: { id: string; abbreviation: string; slug: string }
	windowKey: string | null
	settledCount: number
	wins: number
	losses: number
	pendingCount: number
	netPoints: number
}

export type CalendarDay = {
	day: string
	settledCount: number
	wins: number
	losses: number
	pendingCount: number
	netPoints: number
	grade: string | null
	leagues: CalendarDayLeague[]
}

export type Calendar = {
	startDay: string
	endDay: string
	activeDays: number
	callCount: number
	days: CalendarDay[]
}

type Props = {
	calendar: Calendar
	username: string
}

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

function signedTone(points: number): string {
	return points > 0
		? css({ color: "success.default" })
		: points < 0
			? css({ color: "danger.default" })
			: css({ color: "fg.default" })
}

// GitHub's contribution grid, for calls: a column per week, Sunday on top,
// one square per day. Green for a day that netted points, red for one that
// lost them, darker for a bigger day by this caller's own standards. Picking
// a square opens that day below the grid, with a link to each league's
// report card for it.
export function ResultsCalendar({ calendar, username }: Props) {
	const byDay = new Map(calendar.days.map((day) => [day.day, day]))
	const steps = calendarSteps(calendar.days)
	const latest = calendar.days.at(-1)?.day ?? null
	const [selected, setSelected] = useState<string | null>(latest)
	const [hovered, setHovered] = useState<string | null>(null)
	const scrollRef = useRef<HTMLDivElement>(null)

	// Narrow screens scroll the grid inside its own box. Starts at the most
	// recent week, which is the one anyone opens a profile to see.
	useEffect(() => {
		const el = scrollRef.current
		if (el) el.scrollLeft = el.scrollWidth
	}, [])

	const start = DateTime.fromISO(calendar.startDay)
	const end = DateTime.fromISO(calendar.endDay)
	const dayCount = Math.floor(end.diff(start, "days").days) + 1
	const weeks = Math.ceil(dayCount / 7)
	const dates = Array.from(
		{ length: dayCount },
		(_, i) => start.plus({ days: i }).toISODate() ?? "",
	)

	const monthLabels: (string | null)[] = []
	let lastMonth: number | null = null
	let lastLabeled = Number.NEGATIVE_INFINITY
	for (let week = 0; week < weeks; week++) {
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

	const columns = { gridTemplateColumns: `repeat(${weeks}, minmax(0, 1fr))` }
	const shown = byDay.get(hovered ?? selected ?? "")
	const hasPending = calendar.days.some(
		(day) => day.settledCount === 0 && day.pendingCount > 0,
	)

	return (
		<Card variant="surface" size="md">
			<Card.Body>
				<VStack alignItems="stretch" gap="4">
					<Flex
						justify="space-between"
						alignItems={{ base: "flex-start", sm: "center" }}
						direction={{ base: "column", sm: "row" }}
						gap="2"
					>
						<span className={css({ fontSize: "sm", color: "fg.body" })}>
							{calendar.callCount.toLocaleString()}{" "}
							{pluralize(calendar.callCount, "call")} on {calendar.activeDays}{" "}
							{pluralize(calendar.activeDays, "day")}, last {weeks} weeks
						</span>
						<Legend hasPending={hasPending} />
					</Flex>

					<div
						ref={scrollRef}
						// Padded on every side because a scroll box clips whatever
						// draws past it, which is exactly where the selected ring sits
						// on an edge column. The negative margin keeps the grid where
						// it was.
						className={css({ overflowX: "auto", padding: "1", margin: "-1" })}
					>
						{/* A floor on the cell size, so a phone scrolls the grid
						    rather than shrinking every square to a speck. */}
						<VStack
							alignItems="stretch"
							gap="1.5"
							className={css({ minWidth: "96" })}
						>
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
									const isSelected = selected === date
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
													_hover: { outline: "2px solid {colors.fg.default}" },
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
					</div>

					{shown ? (
						<DayDetail day={shown} username={username} />
					) : (
						<span className={css({ fontSize: "sm", color: "fg.muted" })}>
							No calls in this stretch.
						</span>
					)}
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
		<VStack
			alignItems="stretch"
			gap="2"
			className={css({
				borderTop: "1px solid {colors.border.default}",
				paddingTop: "3",
			})}
		>
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
