import { useEffect, useRef, useState } from "react"
import { css, cx } from "styled-system/css"
import { clamp } from "#/lib/format-number"

type Props = {
	value: number
	onChange: (value: number) => void
	min?: number
	max?: number
	className?: string
	"aria-label"?: string
}

// The root is the full-height hit area; the visible rail is much thinner.
// The inline padding is half the knob, so the knob stays inside the
// component at both ends instead of overhanging the card edge.
// pan-y lets a vertical swipe that starts on the slider still scroll the
// page. The browser then cancels the pointer, see onPointerCancel.
const rootStyle = css({
	position: "relative",
	width: "full",
	height: "11",
	display: "flex",
	alignItems: "center",
	paddingInline: "3",
	cursor: "pointer",
	touchAction: "pan-y",
	userSelect: "none",
	WebkitTapHighlightColor: "transparent",
})

const railStyle = css({
	position: "relative",
	width: "full",
	height: "1.5",
	borderRadius: "full",
	backgroundColor: "border.emphasized",
})

const fillStyle = css({
	position: "absolute",
	insetBlock: "0",
	left: "0",
	borderRadius: "full",
	backgroundColor: "primary.default",
})

// A 44px transparent touch target around the visible knob. touch-action none
// here (unlike the root) means a drag that starts on the knob is never
// hijacked into a page scroll, even if it wanders vertically.
const thumbStyle = css({
	position: "absolute",
	top: "50%",
	width: "11",
	height: "11",
	transform: "translate(-50%, -50%)",
	display: "flex",
	alignItems: "center",
	justifyContent: "center",
	touchAction: "none",
	outline: "none",
	cursor: "grab",
	_active: { cursor: "grabbing" },
	"&:focus-visible > span": {
		outline: "2px solid {colors.border.emphasized}",
		outlineOffset: "2px",
	},
})

const knobStyle = css({
	width: "6",
	height: "6",
	borderRadius: "full",
	backgroundColor: "primary.default",
	border: "3px solid {colors.bg.canvas}",
	boxShadow: "0 1px 4px rgba(0, 0, 0, 0.4)",
	transition: "transform 0.12s ease",
})

const knobDraggingStyle = css({ transform: "scale(1.15)" })

export function Slider({
	value,
	onChange,
	min = 1,
	max = 100,
	className,
	"aria-label": ariaLabel,
}: Props) {
	const rootRef = useRef<HTMLDivElement>(null)
	const railRef = useRef<HTMLDivElement>(null)
	// Value at pointerdown, restored if the browser takes the gesture over
	// for scrolling partway through.
	const dragStart = useRef<number | null>(null)
	const [dragging, setDragging] = useState(false)

	// touch-action alone doesn't stop mobile browsers from starting their own
	// gestures (swipe-back, toolbar collapse) while a horizontal drag drifts
	// vertically. Once a touch reads as horizontal, or starts on the knob,
	// every move of that touch is claimed. A touch that reads as vertical is
	// left alone so the page still scrolls.
	useEffect(() => {
		const root = rootRef.current
		if (!root) return
		let start: { x: number; y: number } | null = null
		let claimed = false

		function onTouchStart(e: TouchEvent) {
			const touch = e.touches[0]
			start = { x: touch.clientX, y: touch.clientY }
			claimed =
				e.target instanceof Element && e.target.closest("[role=slider]") !== null
			// Claiming at touchstart is what keeps an edge swipe-back from starting.
			if (claimed) e.preventDefault()
		}

		function onTouchMove(e: TouchEvent) {
			if (!start) return
			if (!claimed) {
				const touch = e.touches[0]
				const dx = Math.abs(touch.clientX - start.x)
				const dy = Math.abs(touch.clientY - start.y)
				if (dx < 4 && dy < 4) return
				if (dy >= dx) {
					start = null
					return
				}
				claimed = true
			}
			if (e.cancelable) e.preventDefault()
		}

		function onTouchEnd() {
			start = null
			claimed = false
		}

		root.addEventListener("touchstart", onTouchStart, { passive: false })
		root.addEventListener("touchmove", onTouchMove, { passive: false })
		root.addEventListener("touchend", onTouchEnd)
		root.addEventListener("touchcancel", onTouchEnd)
		return () => {
			root.removeEventListener("touchstart", onTouchStart)
			root.removeEventListener("touchmove", onTouchMove)
			root.removeEventListener("touchend", onTouchEnd)
			root.removeEventListener("touchcancel", onTouchEnd)
		}
	}, [])

	const range = max - min
	const pct = range > 0 ? ((clamp(value, min, max) - min) / range) * 100 : 0

	function commit(next: number) {
		const clamped = clamp(Math.round(next), min, max)
		if (clamped !== value) onChange(clamped)
	}

	function valueAt(clientX: number): number {
		const rect = railRef.current?.getBoundingClientRect()
		if (!rect || rect.width === 0) return value
		const ratio = clamp((clientX - rect.left) / rect.width, 0, 1)
		return min + ratio * range
	}

	function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
		if (e.button !== 0) return
		dragStart.current = value
		setDragging(true)
		e.currentTarget.setPointerCapture(e.pointerId)
		// A touch on the rail might be the start of a page scroll, so it only
		// moves the value once it turns out to be a drag or a tap. A mouse
		// press is never a scroll.
		if (e.pointerType === "mouse") commit(valueAt(e.clientX))
	}

	function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
		if (dragStart.current === null) return
		commit(valueAt(e.clientX))
	}

	function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
		if (dragStart.current === null) return
		commit(valueAt(e.clientX))
		dragStart.current = null
		setDragging(false)
	}

	function onPointerCancel() {
		if (dragStart.current !== null && dragStart.current !== value) {
			onChange(dragStart.current)
		}
		dragStart.current = null
		setDragging(false)
	}

	function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
		const big = Math.max(1, Math.round(range / 10))
		const next: Record<string, number> = {
			ArrowRight: value + 1,
			ArrowUp: value + 1,
			ArrowLeft: value - 1,
			ArrowDown: value - 1,
			PageUp: value + big,
			PageDown: value - big,
			Home: min,
			End: max,
		}
		if (!(e.key in next)) return
		e.preventDefault()
		commit(next[e.key])
	}

	return (
		<div
			ref={rootRef}
			className={cx(rootStyle, className)}
			onPointerDown={onPointerDown}
			onPointerMove={onPointerMove}
			onPointerUp={onPointerUp}
			onPointerCancel={onPointerCancel}
		>
			<div ref={railRef} className={railStyle}>
				<div className={fillStyle} style={{ width: `${pct}%` }} />
				<div
					role="slider"
					tabIndex={0}
					aria-label={ariaLabel}
					aria-valuemin={min}
					aria-valuemax={max}
					aria-valuenow={value}
					aria-orientation="horizontal"
					className={thumbStyle}
					style={{ left: `${pct}%` }}
					onKeyDown={onKeyDown}
				>
					<span className={cx(knobStyle, dragging && knobDraggingStyle)} />
				</div>
			</div>
		</div>
	)
}
