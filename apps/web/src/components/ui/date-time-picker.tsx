import { DateTime } from "luxon"
import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { FiCalendar, FiChevronLeft, FiChevronRight } from "react-icons/fi"
import { cx } from "styled-system/css"
import { dateTimePicker as dateTimePickerRecipe } from "styled-system/recipes"
import { Button } from "./button"

// Matches what a native <input type="datetime-local"> used to produce - no
// timezone offset, so `new Date(value)` (the zod schema's refine, and the API
// resolver's insert) keeps interpreting it as local time exactly like before.
const VALUE_FORMAT = "yyyy-MM-dd'T'HH:mm"
const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"]
// Matches Panda's default `md` breakpoint (768px), same cutoff app-shell.tsx
// uses to switch between the desktop nav rail and the mobile drawer - below
// it, the calendar renders as a bottom sheet instead of a trigger-anchored
// popover (see the `content` slot in panda.config.ts).
const MOBILE_BREAKPOINT = 768

function isMobileViewport(): boolean {
	return typeof window !== "undefined" && window.innerWidth < MOBILE_BREAKPOINT
}

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

// Always 6 full weeks so the popover's height never shifts between months.
function buildGridDays(viewMonth: DateTime): DateTime[] {
	const startOfMonth = viewMonth.startOf("month")
	const gridStart = startOfMonth.minus({ days: startOfMonth.weekday % 7 })
	return Array.from({ length: 42 }, (_, i) => gridStart.plus({ days: i }))
}

type DateTimePickerProps = {
	value: string
	onValueChange: (value: string) => void
	description?: string
	error?: string
	className?: string
}

export function DateTimePicker({
	value,
	onValueChange,
	description,
	error,
	className,
}: DateTimePickerProps) {
	const [open, setOpen] = useState(false)
	const [viewMonth, setViewMonth] = useState<DateTime>(() =>
		(parseValue(value) ?? roundedNow()).startOf("month"),
	)
	// Edges of the trigger button, not a placement yet - the layout effect
	// below turns this into an actual top/left once it can measure how tall
	// the popover rendered (needed to decide whether it flips above).
	const [triggerEdges, setTriggerEdges] = useState<{
		top: number
		bottom: number
		left: number
	} | null>(null)
	const [placement, setPlacement] = useState<{
		top: number
		left: number
	} | null>(null)
	const rootRef = useRef<HTMLDivElement>(null)
	const triggerRef = useRef<HTMLButtonElement>(null)
	const contentRef = useRef<HTMLDivElement>(null)

	const selected = parseValue(value)
	const hasError = Boolean(error)
	const slots = dateTimePickerRecipe({ open, hasError })

	function commit(next: DateTime) {
		onValueChange(next.toFormat(VALUE_FORMAT))
	}

	function openPicker() {
		const el = triggerRef.current
		if (el) {
			const r = el.getBoundingClientRect()
			setTriggerEdges({ top: r.top, bottom: r.bottom, left: r.left })
		}
		setViewMonth((selected ?? roundedNow()).startOf("month"))
		setOpen(true)
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

	useEffect(() => {
		if (!open) return

		function updateTriggerEdges() {
			const el = triggerRef.current
			if (!el) return
			const r = el.getBoundingClientRect()
			setTriggerEdges({ top: r.top, bottom: r.bottom, left: r.left })
		}
		function onPointerDown(event: MouseEvent) {
			const target = event.target as Node
			if (
				!rootRef.current?.contains(target) &&
				!contentRef.current?.contains(target)
			) {
				setOpen(false)
			}
		}
		function onKeyDown(event: KeyboardEvent) {
			if (event.key === "Escape") setOpen(false)
		}
		function onScroll() {
			setOpen(false)
		}
		window.addEventListener("resize", updateTriggerEdges)
		document.addEventListener("mousedown", onPointerDown)
		document.addEventListener("keydown", onKeyDown)
		document.addEventListener("scroll", onScroll, true)
		return () => {
			window.removeEventListener("resize", updateTriggerEdges)
			document.removeEventListener("mousedown", onPointerDown)
			document.removeEventListener("keydown", onKeyDown)
			document.removeEventListener("scroll", onScroll, true)
		}
	}, [open])

	// Runs after the popover's actual DOM node exists (so its real height is
	// known) but before the browser paints - flips it above the trigger when
	// there isn't room below, and slides it left/right to stay on-screen,
	// without ever showing the wrong position for a frame.
	useLayoutEffect(() => {
		if (!open || !triggerEdges || isMobileViewport()) return
		const contentEl = contentRef.current
		if (!contentEl) return

		const margin = 8
		const gap = 6
		const contentHeight = contentEl.offsetHeight
		const contentWidth = contentEl.offsetWidth
		const spaceBelow = window.innerHeight - triggerEdges.bottom
		const spaceAbove = triggerEdges.top
		const required = contentHeight + gap + margin
		// Only flip above when it actually fits there - otherwise this used to
		// flip above just because there was *relatively* more room up than
		// down, even when neither side truly fit, which left the popover
		// clipped against the top of the viewport instead of the comparatively
		// more natural (and scrollable) overflow of staying below.
		const placeAbove = spaceBelow < required && spaceAbove >= required

		// Below-placement also slides up to stay fully on-screen when the
		// content is taller than the room left under the trigger (e.g. a
		// trigger sitting low in a modal) - same idea as the horizontal clamp
		// on `left` just below, which this used to lack entirely.
		const top = placeAbove
			? Math.max(margin, triggerEdges.top - contentHeight - gap)
			: Math.max(
					margin,
					Math.min(
						triggerEdges.bottom + gap,
						window.innerHeight - contentHeight - margin,
					),
				)
		const left = Math.min(
			Math.max(margin, triggerEdges.left),
			window.innerWidth - contentWidth - margin,
		)
		setPlacement({ top, left })
		// Deliberately keyed on triggerEdges (open + resize), not every render -
		// the popover's own size is fixed (see buildGridDays), so nothing else
		// changes what this needs to recompute.
	}, [open, triggerEdges])

	const gridDays = buildGridDays(viewMonth)
	const today = DateTime.local().startOf("day")
	const base = selected ?? roundedNow()
	const hour12 = base.hour % 12 === 0 ? 12 : base.hour % 12
	const isPM = base.hour >= 12
	// Re-evaluated on every render (cheap, and re-renders already happen on
	// resize via triggerEdges) rather than tracked in its own state - avoids
	// a second source of truth to keep in sync with the layout effect above.
	const isMobile = isMobileViewport()

	return (
		<div ref={rootRef} className={cx(slots.root, className)}>
			<button
				ref={triggerRef}
				type="button"
				aria-haspopup="dialog"
				aria-expanded={open}
				className={slots.trigger}
				onClick={() => (open ? setOpen(false) : openPicker())}
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
				triggerEdges &&
				createPortal(
					<>
						{isMobile && (
							// Purely visual dimming - the existing outside-pointerdown
							// listener already closes on tap since this div sits outside
							// contentRef, same as clicking anywhere else off the panel.
							<div aria-hidden className={slots.scrim} />
						)}
						<div
							ref={contentRef}
							role="dialog"
							aria-label="Choose date and time"
							className={slots.content}
							style={
								isMobile
									? undefined
									: {
											position: "fixed",
											// Falls back to "below the trigger" for the single
											// frame before the layout effect measures this node
											// and picks a final spot - that effect runs before
											// paint, so this fallback is never actually visible.
											top: placement?.top ?? triggerEdges.bottom + 6,
											left: placement?.left ?? triggerEdges.left,
										}
							}
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
							{WEEKDAYS.map((day) => (
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
							<Button variant="solid" size="sm" onClick={() => setOpen(false)}>
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
