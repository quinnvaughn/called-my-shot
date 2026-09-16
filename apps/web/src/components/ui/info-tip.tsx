import { useEffect, useId, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { FiInfo } from "react-icons/fi"
import { css } from "styled-system/css"

const TIP_WIDTH = 240
const GAP = 6
// Keeps the tip off the very edge of a narrow viewport.
const VIEWPORT_MARGIN = 12

type Rect = { bottom: number; left: number; width: number }

// A small info icon that explains the thing next to it. Opens on mouse hover
// and keyboard focus, and toggles on tap so it still works on touch, where
// there is no hover to reveal it. Each input only drives its own path: a
// mouse click would otherwise close what hovering just opened, and a tap
// focuses the button on some mobile browsers, which would open it right
// before the tap's click toggled it shut.
//
// Closes on scroll rather than following the trigger, the same tradeoff
// ui/select.tsx makes for its fixed-position portal.
export function InfoTip({ label, text }: { label: string; text: string }) {
	const [open, setOpen] = useState(false)
	const [rect, setRect] = useState<Rect | null>(null)
	const triggerRef = useRef<HTMLButtonElement>(null)
	// The pointer behind the press in progress, null when focus or a click
	// came from the keyboard.
	const pressPointerRef = useRef<string | null>(null)
	const tipId = useId()

	useEffect(() => {
		if (!open) {
			setRect(null)
			return
		}
		const el = triggerRef.current
		if (!el) return
		const r = el.getBoundingClientRect()
		setRect({ bottom: r.bottom, left: r.left, width: r.width })

		function close() {
			setOpen(false)
		}
		function onPointerDown(event: PointerEvent) {
			if (triggerRef.current?.contains(event.target as Node)) return
			close()
		}
		function onKeyDown(event: KeyboardEvent) {
			if (event.key === "Escape") close()
		}
		document.addEventListener("pointerdown", onPointerDown)
		document.addEventListener("keydown", onKeyDown)
		document.addEventListener("scroll", close, true)
		window.addEventListener("resize", close)
		return () => {
			document.removeEventListener("pointerdown", onPointerDown)
			document.removeEventListener("keydown", onKeyDown)
			document.removeEventListener("scroll", close, true)
			window.removeEventListener("resize", close)
		}
	}, [open])

	// Centred under the trigger, then clamped so a trigger near either edge of
	// a phone screen keeps the whole tip on it.
	const left = rect
		? Math.max(
				VIEWPORT_MARGIN,
				Math.min(
					rect.left + rect.width / 2 - TIP_WIDTH / 2,
					window.innerWidth - TIP_WIDTH - VIEWPORT_MARGIN,
				),
			)
		: 0

	return (
		<>
			<button
				ref={triggerRef}
				type="button"
				aria-label={`About ${label}`}
				aria-describedby={open ? tipId : undefined}
				aria-expanded={open}
				onPointerDown={(event) => {
					pressPointerRef.current = event.pointerType
				}}
				onClick={() => {
					const pointer = pressPointerRef.current
					pressPointerRef.current = null
					if (pointer !== "mouse") setOpen((prev) => !prev)
				}}
				onPointerEnter={(event) => {
					if (event.pointerType === "mouse") setOpen(true)
				}}
				onPointerLeave={(event) => {
					if (event.pointerType === "mouse") setOpen(false)
				}}
				onFocus={() => {
					if (pressPointerRef.current === null) setOpen(true)
				}}
				onBlur={() => setOpen(false)}
				className={css({
					display: "inline-flex",
					alignItems: "center",
					justifyContent: "center",
					color: "fg.subtle",
					cursor: "help",
					borderRadius: "full",
					transition: "color 0.15s ease",
					_hover: { color: "fg.default" },
					_focusVisible: {
						outline: "2px solid {colors.primary.default}",
						outlineOffset: "1px",
					},
				})}
			>
				<FiInfo size={11} aria-hidden />
			</button>
			{open &&
				rect &&
				createPortal(
					<div
						id={tipId}
						role="tooltip"
						className={css({
							position: "fixed",
							zIndex: "popover",
							bg: "bg.surface",
							border: "1px solid {colors.border.default}",
							borderRadius: "md",
							boxShadow: "0 12px 32px rgba(0, 0, 0, 0.4)",
							paddingX: "3",
							paddingY: "2",
							fontSize: "xs",
							lineHeight: "relaxed",
							color: "fg.default",
							pointerEvents: "none",
						})}
						style={{ top: rect.bottom + GAP, left, width: TIP_WIDTH }}
					>
						{text}
					</div>,
					document.body,
				)}
		</>
	)
}
