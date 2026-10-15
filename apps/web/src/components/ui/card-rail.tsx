import { type ReactNode, useCallback, useEffect, useRef, useState } from "react"
import { FiChevronLeft, FiChevronRight } from "react-icons/fi"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { StepButton } from "#/components/ui/step-button"

type Props<T> = {
	items: T[]
	getKey: (item: T) => string
	renderItem: (item: T) => ReactNode
	// A section heading for the rail, with an optional leading icon.
	title?: string
	icon?: ReactNode
	// The left side of the header row, after the title when there is one.
	// The prev/next buttons sit at its end.
	header?: ReactNode
	// Names one item for the buttons' labels, e.g. "live call" gives
	// "Previous live call" and "Next live call".
	itemLabel: string
	// Each card's width when there's more than one. The default suits full
	// cards; small tiles pass a narrower share so several show at once.
	itemBasis?: string
}

// A horizontally scrolling row of cards under a header, for sets that would
// otherwise stack into a long vertical scroll.
//
// With more than one item, each card is narrower than the row so the next one
// peeks in from the edge, the trailing edge fades while there's more, and the
// header carries prev/next buttons - three separate cues that there's more to
// the side, since a row of cards otherwise reads as the whole set. A single
// item takes the full width.
export function CardRail<T>({
	items,
	getKey,
	renderItem,
	title,
	icon,
	header,
	itemLabel,
	itemBasis = "min(85%, 360px)",
}: Props<T>) {
	const trackRef = useRef<HTMLDivElement>(null)
	const [canScrollPrev, setCanScrollPrev] = useState(false)
	const [canScrollNext, setCanScrollNext] = useState(false)

	const measure = useCallback(() => {
		const track = trackRef.current
		if (!track) return
		// A pixel of slack: fractional widths can leave scrollLeft a hair short
		// of the true end.
		setCanScrollPrev(track.scrollLeft > 1)
		setCanScrollNext(
			track.scrollLeft + track.clientWidth < track.scrollWidth - 1,
		)
	}, [])

	// biome-ignore lint/correctness/useExhaustiveDependencies: re-measure when the set of cards changes
	useEffect(() => {
		const track = trackRef.current
		if (!track) return
		measure()
		const observer = new ResizeObserver(measure)
		observer.observe(track)
		return () => observer.disconnect()
	}, [measure, items.length])

	const multiple = items.length > 1
	// On a wide page a short set can fit without scrolling, and two dead
	// buttons would suggest otherwise.
	const overflowing = canScrollPrev || canScrollNext

	function scrollByPage(sign: 1 | -1) {
		const track = trackRef.current
		if (!track) return
		track.scrollBy({
			left: sign * track.clientWidth * 0.85,
			behavior: "smooth",
		})
	}

	return (
		<VStack alignItems="stretch" gap="3">
			<HStack gap="2" alignItems="center" minHeight="7">
				{title === undefined ? (
					header
				) : (
					<HStack gap="3" alignItems="center" flexWrap="wrap">
						<h2
							className={css({
								display: "flex",
								alignItems: "center",
								gap: "1.5",
								textStyle: "sectionHeading",
								color: "fg.muted",
							})}
						>
							{icon}
							{title}
						</h2>
						{header}
					</HStack>
				)}
				{overflowing && (
					<HStack gap="1.5" marginInlineStart="auto">
						<StepButton
							label={`Previous ${itemLabel}`}
							disabled={!canScrollPrev}
							onClick={() => scrollByPage(-1)}
						>
							<FiChevronLeft aria-hidden />
						</StepButton>
						<StepButton
							label={`Next ${itemLabel}`}
							disabled={!canScrollNext}
							onClick={() => scrollByPage(1)}
						>
							<FiChevronRight aria-hidden />
						</StepButton>
					</HStack>
				)}
			</HStack>
			<div
				ref={trackRef}
				onScroll={measure}
				// Focusable so the row can be scrolled from the keyboard.
				// biome-ignore lint/a11y/noNoninteractiveTabindex: scroll container
				tabIndex={0}
				style={{ maskImage: edgeMask(canScrollNext) }}
				className={css({
					display: "flex",
					gap: "3",
					overflowX: "auto",
					scrollSnapType: "x mandatory",
					scrollPaddingInline: "0",
					overscrollBehaviorX: "contain",
					// No scrollbar: the peek, the fade and the buttons already say
					// the row scrolls, and the browser's bar under a card row reads
					// as stray chrome.
					scrollbarWidth: "none",
					"&::-webkit-scrollbar": { display: "none" },
					outline: "none",
					borderRadius: "10px",
					_focusVisible: {
						outline: "2px solid {colors.border.emphasized}",
						outlineOffset: "2px",
					},
				})}
			>
				{items.map((item) => (
					<div
						key={getKey(item)}
						className={css({
							display: "grid",
							scrollSnapAlign: "start",
							flexShrink: "0",
						})}
						style={{
							flexBasis: multiple ? itemBasis : "100%",
						}}
					>
						{renderItem(item)}
					</div>
				))}
			</div>
		</VStack>
	)
}

// Fades the trailing edge while the row continues past it, so a card cut off
// there reads as "more this way" rather than a layout bug. The leading edge
// stays sharp: the row starts there, so what's behind it is already known.
function edgeMask(next: boolean): string | undefined {
	if (!next) return undefined
	return "linear-gradient(to right, black calc(100% - 32px), transparent)"
}
