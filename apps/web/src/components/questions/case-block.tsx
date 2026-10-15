import { useLayoutEffect, useRef, useState } from "react"
import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"

type Props = {
	text: string
	// "The case" (a caller's own reasoning) is the default and by far the
	// most common use - resolution notes reuse the same labeled-block
	// treatment with a different label rather than a separate component.
	label?: string
	// A caller's case can run long - CallCard/CallRow opt into a 3-line clamp
	// with a toggle rather than letting a wall of text dominate the card.
	// Resolution notes (the other use of this component) are admin-written
	// captions, short enough that clamping would never trigger - left off by
	// default so that use is unaffected.
	clampable?: boolean
}

// How many lines a clampable case shows before the toggle takes over. Shared
// with the measurement below so the two can't disagree about what "overflows"
// means.
const CLAMP_LINES = 3

// Whether a case overflows CLAMP_LINES depends on the width it renders at, so
// the exact answer needs a DOM measurement. But measuring is something only
// the client can do, and only after hydration - which means the toggle is
// missing from the server's markup and appears a beat later on every card in
// a list, and every one of those cards pays a forced layout to find out.
//
// Most cases don't need any of that. At the extremes the answer is the same
// at every width this renders at, and can be settled from the text's length
// alone, during render, on the server as readily as the client. These two
// bounds are the widest and narrowest lines a card here produces (14px text
// across roughly a 700px column and a 270px one). Only a case that falls
// between them is genuinely undecidable and gets measured.
const CHARS_PER_LINE_AT_WIDEST = 85
const CHARS_PER_LINE_AT_NARROWEST = 34
// Past this it overflows even on the widest card, so it overflows everywhere.
const ALWAYS_OVERFLOWS = CLAMP_LINES * CHARS_PER_LINE_AT_WIDEST
// Under this it fits even on the narrowest card, so it fits everywhere - but
// only for a single paragraph. Line breaks the caller typed are kept, and each
// one starts a new line however few characters precede it, so a short case
// with breaks can still run past CLAMP_LINES.
const NEVER_OVERFLOWS = CLAMP_LINES * CHARS_PER_LINE_AT_NARROWEST

// Plain labeled block, set off from whatever's above it by a top rule - not
// a quoted callout (no icon, no background, no side border). The rule
// itself needs its own padding-top (room between the line and the eyebrow
// text below it), but spacing before this block comes from the containing
// VStack's gap, not a margin here.
export function CaseBlock({ text, label = "The case", clampable }: Props) {
	const [expanded, setExpanded] = useState(false)
	// Settled during render wherever the text's length settles it, so the
	// server's markup already carries the right answer and the common card
	// never measures anything. Only the undecidable band falls through to the
	// layout effect.
	const hardLines = text.split("\n").length
	const alwaysOverflows =
		text.length > ALWAYS_OVERFLOWS || hardLines > CLAMP_LINES
	const neverOverflows = hardLines === 1 && text.length <= NEVER_OVERFLOWS
	const undecidable = clampable === true && !alwaysOverflows && !neverOverflows
	const [measured, setMeasured] = useState(false)
	const textRef = useRef<HTMLSpanElement>(null)
	const clamped = clampable && !expanded

	const overflowing = undecidable
		? measured
		: clampable === true && alwaysOverflows

	// Runs only for the undecidable band above - a case whose length settles
	// the question never reaches here, so most cards do no DOM work at all and
	// never re-render for this.
	//
	// Measured by driving the clamp directly rather than by the obvious
	// `scrollHeight > clientHeight`: -webkit-line-clamp truncates the box
	// itself, so on a clamped element scrollHeight can report the CLAMPED
	// height, and that comparison then reads false on text that is visibly cut
	// off - which is exactly what it did, leaving no "Show more" on a case
	// running well past three lines. Forcing the clamp on and off around the
	// two reads is true whichever height the browser reports, and in a layout
	// effect it lands before paint, so nothing flashes.
	//
	// Re-measured on resize too: whether a given case overflows is a function
	// of the card's WIDTH, so a card that fits at one window size doesn't at
	// another - and width is also the only thing worth re-measuring on. The
	// observer watches the same element measure() mutates, so an unguarded
	// callback re-fires on the height change measure() causes, measures again,
	// and loops - two forced layouts per pass, per card in the list. Height
	// changes are exactly what this ignores; the clamp toggle can't change
	// width, so the loop can't sustain itself.
	//
	// `text` is in the deps although the body never reads it: a new case has to
	// be re-measured, and the observer won't catch that - swapping the text of
	// a clamped element leaves its box exactly CLAMP_LINES tall.
	// biome-ignore lint/correctness/useExhaustiveDependencies: see above
	useLayoutEffect(() => {
		const el = textRef.current
		if (!undecidable || !el) return

		function measure(el: HTMLSpanElement) {
			const previous = el.style.webkitLineClamp
			el.style.webkitLineClamp = String(CLAMP_LINES)
			const clampedHeight = el.clientHeight
			el.style.webkitLineClamp = "unset"
			const fullHeight = el.scrollHeight
			el.style.webkitLineClamp = previous
			setMeasured(fullHeight > clampedHeight)
		}

		let lastWidth = el.clientWidth
		measure(el)

		const observer = new ResizeObserver(() => {
			// Read from the same property the width above came from, so the two
			// are comparable - contentRect and clientWidth disagree the moment
			// anything picks up padding or a border.
			const width = el.clientWidth
			if (width === lastWidth) return
			lastWidth = width
			measure(el)
		})
		observer.observe(el)
		return () => observer.disconnect()
	}, [undecidable, text])

	return (
		<VStack
			gap="1.5"
			alignItems="stretch"
			className={css({
				paddingTop: "3",
				borderTop: "1px solid {colors.border.default}",
			})}
		>
			<span
				className={css({
					fontFamily: "mono",
					fontSize: "4xs",
					letterSpacing: "wide",
					textTransform: "uppercase",
					color: "fg.subtle",
				})}
			>
				{label}
			</span>
			<span
				ref={textRef}
				className={css({
					fontSize: "sm",
					color: "fg.body",
					lineHeight: "relaxed",
					whiteSpace: "pre-wrap",
					overflowWrap: "anywhere",
					lineClamp: clamped ? CLAMP_LINES : "none",
				})}
			>
				{text}
			</span>
			{clampable && overflowing && (
				<button
					type="button"
					onClick={() => setExpanded((v) => !v)}
					className={css({
						textStyle: "meta",
						color: "primary.default",
						background: "none",
						border: "none",
						cursor: "pointer",
						padding: "0",
						alignSelf: "flex-start",
					})}
				>
					{expanded ? "Show less" : "Show more"}
				</button>
			)}
		</VStack>
	)
}
