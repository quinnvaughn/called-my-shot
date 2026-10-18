import type { DateTime } from "luxon"
import {
	type CSSProperties,
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
} from "react"

export const CALENDAR_WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"]

// Always 6 full weeks so the popover's height never shifts between months.
export function buildCalendarGridDays(viewMonth: DateTime): DateTime[] {
	const startOfMonth = viewMonth.startOf("month")
	const gridStart = startOfMonth.minus({ days: startOfMonth.weekday % 7 })
	return Array.from({ length: 42 }, (_, i) => gridStart.plus({ days: i }))
}

// Matches Panda's default `md` breakpoint (768px), same cutoff app-shell.tsx
// uses to switch between the desktop nav rail and the mobile drawer - below
// it, the popover renders as a bottom sheet instead of a trigger-anchored
// box (see the dateTimePicker recipe's `content` slot in panda.config.ts).
const MOBILE_BREAKPOINT = 768

function isMobileViewport(): boolean {
	return typeof window !== "undefined" && window.innerWidth < MOBILE_BREAKPOINT
}

type TriggerEdges = {
	top: number
	bottom: number
	left: number
	width: number
}

// A portalled panel hung off a trigger button: open state, outside-click /
// Escape / scroll dismissal, and a fixed placement that flips above the
// trigger when there's no room below. Below `md` no placement is returned and
// the content's own styles pin it as a bottom sheet. matchTriggerWidth sizes
// the panel to the trigger, the way a Select's dropdown hangs off its field.
export function useAnchoredPopover({
	matchTriggerWidth = false,
}: {
	matchTriggerWidth?: boolean
} = {}) {
	const [open, setOpen] = useState(false)
	// Edges of the trigger button, not a placement yet - the layout effect
	// below turns this into an actual top/left once it can measure how tall
	// the popover rendered (needed to decide whether it flips above).
	const [triggerEdges, setTriggerEdges] = useState<TriggerEdges | null>(null)
	const [placement, setPlacement] = useState<{
		top: number
		left: number
	} | null>(null)
	const rootRef = useRef<HTMLDivElement>(null)
	const triggerRef = useRef<HTMLButtonElement>(null)
	const contentRef = useRef<HTMLDivElement>(null)

	function openPopover() {
		const el = triggerRef.current
		if (el) {
			const r = el.getBoundingClientRect()
			setTriggerEdges({
				top: r.top,
				bottom: r.bottom,
				left: r.left,
				width: r.width,
			})
		}
		setOpen(true)
	}

	useEffect(() => {
		if (!open) return

		function updateTriggerEdges() {
			const el = triggerRef.current
			if (!el) return
			const r = el.getBoundingClientRect()
			setTriggerEdges({
				top: r.top,
				bottom: r.bottom,
				left: r.left,
				width: r.width,
			})
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
		// Scrolling the page moves the trigger out from under the panel, so it
		// closes; scrolling inside the panel itself (a list it holds) doesn't.
		function onScroll(event: Event) {
			if (contentRef.current?.contains(event.target as Node)) return
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
		// Only flips above when it actually fits there. When neither side
		// fits, staying below and overflowing (scrollable) reads more
		// naturally than being clipped against the top of the viewport.
		const placeAbove = spaceBelow < required && spaceAbove >= required

		// Below-placement also slides up to stay fully on-screen when the
		// content is taller than the room left under the trigger (e.g. a
		// trigger sitting low in a modal) - same idea as the horizontal clamp
		// on `left` just below.
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
		// the popover's own size is fixed (see buildCalendarGridDays), so
		// nothing else changes what this needs to recompute.
	}, [open, triggerEdges])

	// Re-evaluated on every render (cheap, and re-renders already happen on
	// resize via triggerEdges) rather than tracked in its own state - avoids
	// a second source of truth to keep in sync with the layout effect above.
	const isMobile = isMobileViewport()
	const contentStyle: CSSProperties | undefined =
		isMobile || !triggerEdges
			? undefined
			: {
					position: "fixed",
					// Falls back to "below the trigger" for the single frame before
					// the layout effect measures this node and picks a final spot -
					// that effect runs before paint, so this fallback is never
					// actually visible.
					top: placement?.top ?? triggerEdges.bottom + 6,
					left: placement?.left ?? triggerEdges.left,
					...(matchTriggerWidth && { width: triggerEdges.width }),
				}

	return {
		open: open && triggerEdges !== null,
		openPopover,
		close: () => setOpen(false),
		rootRef,
		triggerRef,
		contentRef,
		contentStyle,
		isMobile,
	}
}
