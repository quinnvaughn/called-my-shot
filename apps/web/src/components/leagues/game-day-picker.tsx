import { SPORTS_TIME_ZONE } from "@called-my-shot/schemas"
import { DateTime } from "luxon"
import { useState } from "react"
import { createPortal } from "react-dom"
import { FiCalendar, FiChevronLeft, FiChevronRight } from "react-icons/fi"
import { css, cx } from "styled-system/css"
import {
	dateTimePicker as dateTimePickerRecipe,
	select as selectRecipe,
} from "styled-system/recipes"
import {
	buildCalendarGridDays,
	CALENDAR_WEEKDAYS,
	useAnchoredPopover,
} from "#/components/ui/use-anchored-popover"
import { pluralize } from "#/lib/pluralize"

type DayWindow = { key: string; gameCount: number }

type GameDayPickerProps = {
	// Every day the league has synced games, keyed "yyyy-MM-dd" in ET - the
	// same keys getLeagueWindows produces for a day-window league.
	windows: DayWindow[]
	selectedKey: string
	label: string
	onSelect: (key: string) => void
}

function parseDayKey(key: string): DateTime | null {
	const day = DateTime.fromISO(key, { zone: SPORTS_TIME_ZONE })
	return day.isValid ? day : null
}

// The Games tab's jump-to-day control for a day-window league (MLB/NBA). Days
// without a game are disabled, so a jump can never land on an empty slate,
// and each playable day shows how many games are on it.
export function GameDayPicker({
	windows,
	selectedKey,
	label,
	onSelect,
}: GameDayPickerProps) {
	const popover = useAnchoredPopover({ matchTriggerWidth: true })
	const { open } = popover
	const today = DateTime.now().setZone(SPORTS_TIME_ZONE).startOf("day")
	const selected = parseDayKey(selectedKey)
	const [viewMonth, setViewMonth] = useState<DateTime>(() =>
		(selected ?? today).startOf("month"),
	)
	const slots = dateTimePickerRecipe({ open })
	// The trigger is the Select field this replaced, so it lines up with the
	// prev/next steppers beside it the same way.
	const triggerSlots = selectRecipe({ open })

	const countsByKey = new Map(windows.map((w) => [w.key, w.gameCount]))
	const firstDay = windows[0] ? parseDayKey(windows[0].key) : null
	const lastWindow = windows[windows.length - 1]
	const lastDay = lastWindow ? parseDayKey(lastWindow.key) : null
	const canGoBack = Boolean(firstDay && viewMonth > firstDay.startOf("month"))
	const canGoForward = Boolean(lastDay && viewMonth < lastDay.startOf("month"))

	function openPicker() {
		setViewMonth((selected ?? today).startOf("month"))
		popover.openPopover()
	}

	function pick(key: string) {
		popover.close()
		if (key !== selectedKey) onSelect(key)
	}

	const navButtonClass = cx(
		slots.navButton,
		css({ _disabled: { opacity: 0.3, cursor: "default", bg: "transparent" } }),
	)

	return (
		<div ref={popover.rootRef} className={triggerSlots.root}>
			<button
				ref={popover.triggerRef}
				type="button"
				aria-haspopup="dialog"
				aria-expanded={open}
				className={cx(
					triggerSlots.trigger,
					open && css({ border: "1px solid {colors.secondary.default}" }),
				)}
				onClick={() => (open ? popover.close() : openPicker())}
			>
				<span
					className={cx(
						triggerSlots.triggerLabel,
						css({ textAlign: "center" }),
					)}
				>
					{label}
				</span>
				<FiCalendar
					size={12}
					className={css({ flexShrink: 0, color: "fg.subtle" })}
				/>
			</button>
			{open &&
				createPortal(
					<>
						{popover.isMobile && <div aria-hidden className={slots.scrim} />}
						<div
							ref={popover.contentRef}
							role="dialog"
							aria-label="Choose a day"
							className={slots.content}
							style={popover.contentStyle}
						>
							<div className={slots.dragHandle} />
							<div className={slots.calendarHeader}>
								<button
									type="button"
									aria-label="Previous month"
									disabled={!canGoBack}
									className={navButtonClass}
									onClick={() => setViewMonth((m) => m.minus({ months: 1 }))}
								>
									<FiChevronLeft size={14} />
								</button>
								<span className={slots.monthLabel}>
									{viewMonth.toFormat("LLLL yyyy")}
								</span>
								<button
									type="button"
									aria-label="Next month"
									disabled={!canGoForward}
									className={navButtonClass}
									onClick={() => setViewMonth((m) => m.plus({ months: 1 }))}
								>
									<FiChevronRight size={14} />
								</button>
							</div>
							<div className={slots.weekdayRow}>
								{CALENDAR_WEEKDAYS.map((day) => (
									<span key={day} className={slots.weekday}>
										{day}
									</span>
								))}
							</div>
							<div className={slots.dayGrid}>
								{buildCalendarGridDays(viewMonth).map((day) => {
									const key = day.toFormat("yyyy-LL-dd")
									const gameCount = countsByKey.get(key) ?? 0
									const isSelected = key === selectedKey
									const isToday = !isSelected && day.hasSame(today, "day")
									const { day: dayClass } = dateTimePickerRecipe({
										dayOutside: day.month !== viewMonth.month,
										dayToday: isToday,
										daySelected: isSelected,
										dayDisabled: gameCount === 0,
									})
									return (
										<button
											key={key}
											type="button"
											disabled={gameCount === 0}
											aria-current={isToday ? "date" : undefined}
											aria-pressed={isSelected}
											aria-label={`${day.toFormat("cccc, LLLL d")}, ${
												gameCount === 0
													? "no games"
													: `${gameCount} ${pluralize(gameCount, "game")}`
											}`}
											className={cx(
												dayClass,
												// Sized to the trigger's width, so square cells would
												// make the panel far taller than a month needs.
												css({
													flexDirection: "column",
													gap: "0",
													lineHeight: "1.1",
													aspectRatio: "auto",
													height: "12",
												}),
												// Jumping between days is navigation, not a CTA, so it
												// takes the secondary accent over the recipe's primary.
												isToday && css({ color: "secondary.default" }),
												isSelected &&
													css({
														backgroundColor: "secondary.default",
														color: "secondary.contrast",
														_hover: { backgroundColor: "secondary.default" },
													}),
											)}
											onClick={() => pick(key)}
										>
											<span>{day.day}</span>
											{gameCount > 0 && (
												<span
													className={css({
														fontFamily: "mono",
														fontSize: "3xs",
														fontWeight: "normal",
														opacity: 0.7,
													})}
												>
													{gameCount}
													<span
														className={css({
															display: { base: "none", md: "inline" },
														})}
													>
														{` ${pluralize(gameCount, "game")}`}
													</span>
												</span>
											)}
										</button>
									)
								})}
							</div>
							{/* Desktop cells spell out "N games"; mobile ones only fit the number. */}
							<span
								className={css({
									display: { base: "block", md: "none" },
									textAlign: "center",
									fontFamily: "mono",
									fontSize: "2xs",
									color: "fg.subtle",
								})}
							>
								The small number is how many games are on that day.
							</span>
						</div>
					</>,
					document.body,
				)}
		</div>
	)
}
