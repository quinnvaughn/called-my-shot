import { DateTime } from "luxon"
import { useState } from "react"
import { createPortal } from "react-dom"
import { FiCalendar, FiChevronLeft, FiChevronRight } from "react-icons/fi"
import { cx } from "styled-system/css"
import { dateTimePicker as dateTimePickerRecipe } from "styled-system/recipes"
import { Button } from "./button"
import {
	buildCalendarGridDays,
	CALENDAR_WEEKDAYS,
	useAnchoredPopover,
} from "./use-anchored-popover"

// Matches what a native <input type="datetime-local"> used to produce - no
// timezone offset, so `new Date(value)` (the zod schema's refine, and the API
// resolver's insert) keeps interpreting it as local time exactly like before.
// Exported so callers that fill this field from something other than the
// picker itself (the game field auto-setting locksAt from a picked game's
// startsAt) can produce a value in the same shape.
export const DATE_TIME_PICKER_VALUE_FORMAT = "yyyy-MM-dd'T'HH:mm"
const VALUE_FORMAT = DATE_TIME_PICKER_VALUE_FORMAT

function parseValue(value: string): DateTime | null {
	if (!value) return null
	const parsed = DateTime.fromFormat(value, VALUE_FORMAT)
	return parsed.isValid ? parsed : null
}

// Sensible starting point when nothing's picked yet - "now" itself would
// already fail the schema's "must be in the future" check by the time the
// user hits submit.
function roundedNow(): DateTime {
	const now = DateTime.local().set({ second: 0, millisecond: 0 })
	const remainder = now.minute % 5
	return remainder === 0 ? now : now.plus({ minutes: 5 - remainder })
}

type DateTimePickerProps = {
	value: string
	onValueChange: (value: string) => void
	description?: string
	error?: string
	className?: string
	// The game field sets this once a game is picked - locksAt is then the
	// game's own startsAt, not something the creator chooses by hand.
	disabled?: boolean
}

export function DateTimePicker({
	value,
	onValueChange,
	description,
	error,
	className,
	disabled,
}: DateTimePickerProps) {
	const popover = useAnchoredPopover()
	const { open } = popover
	const [viewMonth, setViewMonth] = useState<DateTime>(() =>
		(parseValue(value) ?? roundedNow()).startOf("month"),
	)

	const selected = parseValue(value)
	const hasError = Boolean(error)
	// disabled isn't passed to the recipe - the trigger's own native `disabled`
	// attribute below drives its look via the recipe's _disabled pseudo-class,
	// same pattern as the button recipe.
	const slots = dateTimePickerRecipe({ open, hasError })

	function commit(next: DateTime) {
		onValueChange(next.toFormat(VALUE_FORMAT))
	}

	function openPicker() {
		setViewMonth((selected ?? roundedNow()).startOf("month"))
		popover.openPopover()
	}

	function selectDay(day: DateTime) {
		const base = selected ?? roundedNow()
		commit(
			day.set({
				hour: base.hour,
				minute: base.minute,
				second: 0,
				millisecond: 0,
			}),
		)
		if (day.month !== viewMonth.month || day.year !== viewMonth.year) {
			setViewMonth(day.startOf("month"))
		}
	}

	function setHour12(hour12: number) {
		if (Number.isNaN(hour12)) return
		const base = selected ?? roundedNow()
		const isPM = base.hour >= 12
		const clamped = Math.min(12, Math.max(1, hour12))
		commit(base.set({ hour: isPM ? (clamped % 12) + 12 : clamped % 12 }))
	}

	function setMinute(minute: number) {
		if (Number.isNaN(minute)) return
		const base = selected ?? roundedNow()
		commit(base.set({ minute: Math.min(59, Math.max(0, minute)) }))
	}

	function setMeridiem(isPM: boolean) {
		const base = selected ?? roundedNow()
		const hour12 = base.hour % 12 === 0 ? 12 : base.hour % 12
		commit(base.set({ hour: isPM ? (hour12 % 12) + 12 : hour12 % 12 }))
	}

	const gridDays = buildCalendarGridDays(viewMonth)
	const today = DateTime.local().startOf("day")
	const base = selected ?? roundedNow()
	const hour12 = base.hour % 12 === 0 ? 12 : base.hour % 12
	const isPM = base.hour >= 12

	return (
		<div ref={popover.rootRef} className={cx(slots.root, className)}>
			<button
				ref={popover.triggerRef}
				type="button"
				disabled={disabled}
				aria-haspopup="dialog"
				aria-expanded={open}
				className={slots.trigger}
				onClick={() => (open ? popover.close() : openPicker())}
			>
				<span className={slots.triggerLabel}>
					{selected
						? selected.toFormat("ccc, LLL d, yyyy 'at' h:mm a")
						: "Select date & time"}
				</span>
				<FiCalendar size={14} className={slots.triggerIcon} />
			</button>
			{hasError ? (
				<div role="alert" className={slots.error}>
					{error}
				</div>
			) : (
				description && <div className={slots.description}>{description}</div>
			)}
			{open &&
				createPortal(
					<>
						{popover.isMobile && (
							// Purely visual dimming - the existing outside-pointerdown
							// listener already closes on tap since this div sits outside
							// contentRef, same as clicking anywhere else off the panel.
							<div aria-hidden className={slots.scrim} />
						)}
						<div
							ref={popover.contentRef}
							role="dialog"
							aria-label="Choose date and time"
							className={slots.content}
							style={popover.contentStyle}
						>
							<div className={slots.dragHandle} />
							<div className={slots.calendarHeader}>
							<button
								type="button"
								aria-label="Previous month"
								className={slots.navButton}
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
								className={slots.navButton}
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
							{gridDays.map((day) => {
								const outside = day.month !== viewMonth.month
								const isSelected =
									Boolean(selected) && day.hasSame(selected as DateTime, "day")
								const isToday = !isSelected && day.hasSame(today, "day")
								const isDisabled = day.startOf("day") < today
								const { day: dayClass } = dateTimePickerRecipe({
									dayOutside: outside,
									dayToday: isToday,
									daySelected: isSelected,
									dayDisabled: isDisabled,
								})
								return (
									<button
										key={day.toISODate()}
										type="button"
										disabled={isDisabled}
										aria-current={isToday ? "date" : undefined}
										aria-pressed={isSelected}
										className={dayClass}
										onClick={() => selectDay(day)}
									>
										{day.day}
									</button>
								)
							})}
						</div>
						<div className={slots.timeRow}>
							<input
								aria-label="Hour"
								type="number"
								min={1}
								max={12}
								value={hour12}
								onChange={(e) => setHour12(Number(e.target.value))}
								className={slots.timeField}
							/>
							<span className={slots.timeSeparator}>:</span>
							<input
								aria-label="Minute"
								type="number"
								min={0}
								max={59}
								value={base.minute.toString().padStart(2, "0")}
								onChange={(e) => setMinute(Number(e.target.value))}
								className={slots.timeField}
							/>
							<div className={slots.ampmGroup}>
								{(["AM", "PM"] as const).map((meridiem) => {
									const active = meridiem === "PM" ? isPM : !isPM
									const { ampmButton } = dateTimePickerRecipe({
										ampmActive: active,
									})
									return (
										<button
											key={meridiem}
											type="button"
											className={ampmButton}
											onClick={() => setMeridiem(meridiem === "PM")}
										>
											{meridiem}
										</button>
									)
								})}
							</div>
						</div>
						<div className={slots.footer}>
							<Button
								variant="ghost"
								size="sm"
								onClick={() => commit(roundedNow())}
							>
								Now
							</Button>
							<Button variant="solid" size="sm" onClick={popover.close}>
								Done
							</Button>
						</div>
					</div>
				</>,
				document.body,
			)}
		</div>
	)
}
