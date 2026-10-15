import {
	type HTMLAttributes,
	type RefObject,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react"
import { createPortal } from "react-dom"
import { cx } from "styled-system/css"
import type { select as selectRecipe } from "styled-system/recipes"

export type SelectSlots = ReturnType<typeof selectRecipe>

type DropdownRect = { top: number; left: number; width: number }

export type DropdownPanel = {
	open: boolean
	close: () => void
	toggle: () => void
	rootRef: RefObject<HTMLDivElement | null>
	triggerRef: RefObject<HTMLButtonElement | null>
	contentRef: RefObject<HTMLDivElement | null>
	rect: DropdownRect | null
}

// Shared by Select and MultiSelect - open state, outside-click/Escape close,
// and portal position tracking are identical for both; only what clicking an
// option *does* (replace-and-close vs toggle-and-stay-open) differs between
// them, which lives in each one's own Option component instead of here.
export function useDropdownPanel(): DropdownPanel {
	const [open, setOpen] = useState(false)
	const rootRef = useRef<HTMLDivElement>(null)
	const triggerRef = useRef<HTMLButtonElement>(null)
	// Content is portalled to document.body (see SelectDropdownContent) so an
	// ancestor's `overflow: hidden` - e.g. Card - can't clip the dropdown.
	// That moves it outside rootRef's DOM subtree, so the outside-click check
	// below has to know about both nodes, not just rootRef.
	const contentRef = useRef<HTMLDivElement>(null)
	const [rect, setRect] = useState<DropdownRect | null>(null)

	const close = useCallback(() => setOpen(false), [])
	const toggle = useCallback(() => setOpen((v) => !v), [])

	useEffect(() => {
		if (!open) return

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
		document.addEventListener("mousedown", onPointerDown)
		document.addEventListener("keydown", onKeyDown)
		return () => {
			document.removeEventListener("mousedown", onPointerDown)
			document.removeEventListener("keydown", onKeyDown)
		}
	}, [open])

	useEffect(() => {
		if (!open) return

		function updateRect() {
			const el = triggerRef.current
			if (!el) return
			const r = el.getBoundingClientRect()
			setRect({ top: r.bottom + 6, left: r.left, width: r.width })
		}
		updateRect()
		window.addEventListener("resize", updateRect)
		// No scroll-follow - closing on scroll is the same tradeoff every other
		// lightweight popover in this file makes (Combobox, Dropdown), just
		// applied here too since a fixed-position portal would otherwise go
		// stale under the trigger as the page scrolls. Scrolling *inside* the
		// content itself (a long option list) doesn't count - `scroll` doesn't
		// bubble, but a capture-phase listener on document still sees it fire
		// on that descendant, so without this check the list closes the
		// instant you try to scroll it.
		function onScroll(event: Event) {
			if (contentRef.current?.contains(event.target as Node)) return
			close()
		}
		document.addEventListener("scroll", onScroll, true)
		return () => {
			window.removeEventListener("resize", updateRect)
			document.removeEventListener("scroll", onScroll, true)
		}
	}, [open, close])

	return { open, close, toggle, rootRef, triggerRef, contentRef, rect }
}

type SelectDropdownContentProps = HTMLAttributes<HTMLDivElement> & {
	slots: SelectSlots
	panel: DropdownPanel
}

// Portalled to document.body and positioned from the trigger's own bounding
// rect (fixed, not the recipe's default absolute/top/left/right) rather than
// living inside the root - otherwise an ancestor with `overflow: hidden`
// (Card, most commonly) clips it instead of letting it float above the page
// like a dropdown should. Shared rendering for Select.Content and
// MultiSelect.Content.
export function SelectDropdownContent({
	slots,
	panel,
	className,
	style,
	...props
}: SelectDropdownContentProps) {
	const { open, rect, contentRef } = panel
	if (!open || !rect) return null

	return createPortal(
		<div
			ref={contentRef}
			role="listbox"
			className={cx(slots.content, className)}
			style={{
				position: "fixed",
				top: rect.top,
				left: rect.left,
				width: rect.width,
				right: "auto",
				...style,
			}}
			{...props}
		/>,
		document.body,
	)
}
