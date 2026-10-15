import {
	type RefObject,
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
} from "react"
import { createPortal } from "react-dom"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { match } from "ts-pattern"
import { clamp } from "#/lib/format-number"
import { Button } from "./button"

type Rect = { top: number; left: number; width: number; height: number }

// Gap between the highlighted element and the bubble.
const GAP = 12
// Only the starting guess for the first paint; the real height is measured
// once the bubble is in the DOM (see bubbleHeight below).
const ESTIMATED_BUBBLE_HEIGHT = 150
const BUBBLE_WIDTH = 320
// Keeps the bubble off the very edge of a narrow viewport.
const VIEWPORT_MARGIN = 12

// Tracks where the anchor is on screen.
//
// The portal + getBoundingClientRect approach here is the same one ui/select.tsx
// uses, with one deliberate difference: select CLOSES on scroll, because a
// dropdown that drifts away from its trigger is worse than one that vanishes.
// A coachmark can't do that. It points at a form field the user often has to
// scroll to reach, and dismissing the explanation the moment they scroll toward
// the thing being explained is useless. So this re-measures on scroll instead,
// in the capture phase to catch scrolling inside any container, not just the
// page.
//
// Re-runs per step without taking the step index as a dependency: each step
// points at a different anchor, so anchorRef itself changes identity between
// them.
function useAnchorRect(
	anchorRef: RefObject<HTMLElement | null>,
	active: boolean,
) {
	const [rect, setRect] = useState<Rect | null>(null)

	useEffect(() => {
		if (!active) {
			setRect(null)
			return
		}
		const el = anchorRef.current
		if (!el) return

		function measure() {
			const el = anchorRef.current
			if (!el) return
			const r = el.getBoundingClientRect()
			setRect({ top: r.top, left: r.left, width: r.width, height: r.height })
		}

		// The anchor for a later step is usually below the fold. Scroll it into
		// view first, then measure - measuring before the scroll settles would
		// place the bubble against the old position.
		el.scrollIntoView({ block: "center", behavior: "smooth" })
		measure()

		window.addEventListener("resize", measure)
		document.addEventListener("scroll", measure, true)
		return () => {
			window.removeEventListener("resize", measure)
			document.removeEventListener("scroll", measure, true)
		}
	}, [anchorRef, active])

	return rect
}

type Placement = "below" | "above"

// Below the anchor, flipping above only when there is not room. Beside it was
// tempting on a wide desktop layout, but there is no side room on a phone, so
// it would have meant one behaviour to design against and a different one to
// actually ship. Clearing the anchor vertically works at every width.
function placementFor(rect: Rect, height: number): Placement {
	const roomBelow = window.innerHeight - (rect.top + rect.height)
	return roomBelow >= height + GAP ? "below" : "above"
}

type Props = {
	anchorRef: RefObject<HTMLElement | null>
	title: string
	body: string
	step: number
	total: number
	// Omitted on a step whose exit is the user doing the thing being explained
	// (picking an option, opening the review). Those steps show `hint` plus the
	// quiet `onSkipStep` link instead, so the action is the obvious path
	// without a prominent Next inviting people to skim past it.
	onNext?: () => void
	onBack?: () => void
	hint?: string
	// The way out of a gated step for someone who does not want to do it yet.
	// Deliberately low emphasis: nobody should be trapped, but it should not
	// compete with the thing the step is asking for.
	onSkipStep?: () => void
	onSkip: () => void
}

export function Coachmark({
	anchorRef,
	title,
	body,
	step,
	total,
	onNext,
	onBack,
	hint,
	onSkipStep,
	onSkip,
}: Props) {
	const rect = useAnchorRect(anchorRef, true)
	const bubbleRef = useRef<HTMLDivElement>(null)
	// Measured rather than assumed: these bubbles run from about 150px to over
	// 300px depending on the copy, and a fixed estimate put the taller ones in
	// the wrong place - which is how step 2 ended up covering the payout
	// preview. Re-measured per step, since each one has different copy.
	const [bubbleHeight, setBubbleHeight] = useState(ESTIMATED_BUBBLE_HEIGHT)

	useLayoutEffect(() => {
		const el = bubbleRef.current
		if (el) setBubbleHeight(el.offsetHeight)
	}, [])

	useEffect(() => {
		function onKeyDown(event: KeyboardEvent) {
			if (event.key === "Escape") onSkip()
		}
		document.addEventListener("keydown", onKeyDown)
		return () => document.removeEventListener("keydown", onKeyDown)
	}, [onSkip])

	if (!rect) return null

	const placement = placementFor(rect, bubbleHeight)

	const top = match(placement)
		.with("below", () => rect.top + rect.height + GAP)
		.with("above", () => rect.top - GAP - bubbleHeight)
		.exhaustive()

	// Centred on the anchor, then clamped so a bubble pointing at something
	// near the edge of a narrow screen stays fully on it. On a screen narrower
	// than the bubble the range inverts and it pins to the left margin, so its
	// start stays readable.
	const left = clamp(
		rect.left + rect.width / 2 - BUBBLE_WIDTH / 2,
		VIEWPORT_MARGIN,
		window.innerWidth - BUBBLE_WIDTH - VIEWPORT_MARGIN,
	)

	const isLast = step === total - 1

	return createPortal(
		<>
			{/* One element does the whole dimming job: an enormous spread
			    box-shadow paints everything OUTSIDE this box, so the anchor
			    stays at full brightness with no second scrim to keep in sync.
			    Which makes what each step anchors to load-bearing - anything
			    left outside is dimmed, so a step's anchor has to cover
			    everything that step is talking about. pointerEvents none so the
			    highlighted control is still usable. */}
			<div
				className={css({
					position: "fixed",
					borderRadius: "md",
					pointerEvents: "none",
					// Literal rather than the bg.overlay/70 the modal scrim uses:
					// this is a box-shadow COLOR inside a composite value, which
					// Panda doesn't resolve tokens in. Same #0B0B0C at 70% the
					// overlay token carries, kept in step with it by hand.
					boxShadow: "0 0 0 9999px rgba(11, 11, 12, 0.7)",
					zIndex: "coachmarkSpotlight",
				})}
				style={{
					top: rect.top - 4,
					left: rect.left - 4,
					width: rect.width + 8,
					height: rect.height + 8,
				}}
			/>
			<div
				role="dialog"
				aria-label={title}
				className={css({
					position: "fixed",
					width: "320px",
					maxWidth: "calc(100vw - 24px)",
					backgroundColor: "bg.surface",
					border: "1px solid {colors.border.emphasized}",
					borderRadius: "lg",
					padding: "4",
					// Matches the lift every other portalled panel in
					// panda.config.ts uses.
					boxShadow: "0 12px 32px rgba(0, 0, 0, 0.4)",
					zIndex: "coachmark",
				})}
				ref={bubbleRef}
				style={{ top, left }}
			>
				<VStack gap="3" alignItems="stretch">
					<VStack gap="1.5" alignItems="flex-start">
						<span
							className={css({
								textStyle: "labelSm",
								color: "fg.muted",
							})}
						>
							Step {step + 1} of {total}
						</span>
						<h2
							className={css({
								fontFamily: "heading",
								fontSize: "sm",
								color: "fg.default",
							})}
						>
							{title}
						</h2>
						<p
							className={css({
								fontSize: "xs",
								lineHeight: "relaxed",
								color: "fg.body",
							})}
						>
							{body}
						</p>
					</VStack>
					{/* The hint gets its own line rather than sitting in the button
					    row. Three pieces of text competing for one 300px row wrapped
					    every one of them onto two lines. */}
					{!onNext && hint && (
						<span
							className={css({
								textStyle: "meta",
								color: "fg.subtle",
							})}
						>
							{hint}
						</span>
					)}
					<HStack justify="space-between" gap="3">
						{/* "End tour" vs "Skip", not "Skip tour" vs "Skip step" -
						    two near-identical labels side by side made the
						    smaller, more destructive one easy to hit by mistake. */}
						<button
							type="button"
							onClick={onSkip}
							className={css({
								textStyle: "meta",
								color: "fg.muted",
								whiteSpace: "nowrap",
								cursor: "pointer",
								_hover: { color: "fg.default" },
							})}
						>
							End tour
						</button>
						<HStack gap="2" alignItems="center">
							{onBack && (
								<Button size="sm" variant="outline" onClick={onBack}>
									Back
								</Button>
							)}
							{onNext ? (
								<Button size="sm" variant="solid" onClick={onNext}>
									{isLast ? "Got it" : "Next"}
								</Button>
							) : (
								onSkipStep && (
									<Button size="sm" variant="outline" onClick={onSkipStep}>
										Skip
									</Button>
								)
							)}
						</HStack>
					</HStack>
				</VStack>
			</div>
		</>,
		document.body,
	)
}
