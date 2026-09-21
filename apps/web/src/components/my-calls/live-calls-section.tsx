import { useQuery } from "@tanstack/react-query"
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react"
import { FiChevronLeft, FiChevronRight } from "react-icons/fi"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { MyCallsTabFragment } from "#/components/my-calls/my-calls-tab"
import { CallCard } from "#/components/questions/call-card"
import { type FragmentType, useFragment } from "#/graphql/generated"
import {
	type MyCallsFilters,
	myLiveCallsQuery,
} from "#/graphql/queries/my-calls"

type LiveCall = { id: string } & FragmentType<typeof MyCallsTabFragment>

// The Open tab's calls whose game is being played right now, as a
// horizontally scrolling row between the tabs and the sort. The server keeps
// these out of the list below (see Query.myLiveCalls), so nothing appears
// twice.
//
// Renders nothing at all when no game the viewer called is in flight, which is
// most of the time.
//
// With more than one call, each card is narrower than the row so the next one
// peeks in from the edge, the edge the row continues past fades out, and the
// header carries prev/next buttons - three separate cues that there's more to
// the side, since a row of cards otherwise reads as the whole set.
export function LiveCallsSection({ filters }: { filters: MyCallsFilters }) {
	const { data } = useQuery(myLiveCallsQuery(filters))
	const calls = data?.myLiveCalls ?? []
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
	}, [measure, calls.length])

	if (calls.length === 0) return null

	const scrollable = calls.length > 1

	function scrollByPage(sign: 1 | -1) {
		const track = trackRef.current
		if (!track) return
		track.scrollBy({
			left: sign * track.clientWidth * 0.85,
			behavior: "smooth",
		})
	}

	return (
		<section aria-label="Playing now">
			<VStack alignItems="stretch" gap="3">
				<HStack gap="2" alignItems="center">
					<span
						className={css({
							width: "1.5",
							height: "1.5",
							borderRadius: "full",
							bg: "success.default",
							animation: "pulse 1.6s ease-in-out infinite",
						})}
					/>
					<span
						className={css({
							fontFamily: "mono",
							fontSize: "2xs",
							letterSpacing: "wide",
							textTransform: "uppercase",
							color: "fg.default",
							fontWeight: "bold",
						})}
					>
						Playing now
					</span>
					<span
						className={css({
							fontFamily: "mono",
							fontSize: "2xs",
							color: "fg.subtle",
						})}
					>
						{calls.length} call{calls.length === 1 ? "" : "s"}
					</span>
					{scrollable && (
						<HStack gap="1.5" marginInlineStart="auto">
							<ScrollButton
								label="Previous live call"
								disabled={!canScrollPrev}
								onClick={() => scrollByPage(-1)}
							>
								<FiChevronLeft aria-hidden />
							</ScrollButton>
							<ScrollButton
								label="Next live call"
								disabled={!canScrollNext}
								onClick={() => scrollByPage(1)}
							>
								<FiChevronRight aria-hidden />
							</ScrollButton>
						</HStack>
					)}
				</HStack>
				<div
					ref={trackRef}
					onScroll={measure}
					// Focusable so the row can be scrolled from the keyboard.
					// biome-ignore lint/a11y/noNoninteractiveTabindex: scroll container
					tabIndex={0}
					style={{ maskImage: edgeMask(canScrollPrev, canScrollNext) }}
					className={css({
						display: "flex",
						gap: "3",
						overflowX: "auto",
						scrollSnapType: "x mandatory",
						scrollPaddingInline: "0",
						overscrollBehaviorX: "contain",
						scrollbarWidth: "thin",
						paddingBlockEnd: "2",
						outline: "none",
						borderRadius: "10px",
						_focusVisible: {
							outline: "2px solid {colors.border.emphasized}",
							outlineOffset: "2px",
						},
					})}
				>
					{calls.map((call) => (
						<div
							key={call.id}
							className={css({
								display: "grid",
								scrollSnapAlign: "start",
								flexShrink: "0",
							})}
							style={{
								flexBasis: scrollable ? "min(85%, 360px)" : "100%",
							}}
						>
							<LiveCallCard call={call} />
						</div>
					))}
				</div>
				<div
					className={css({
						height: "1px",
						bg: "border.default",
						marginBlockStart: "1",
					})}
				/>
			</VStack>
		</section>
	)
}

// Fades whichever edge the row continues past, so a card cut off at the edge
// reads as "more this way" rather than a layout bug.
function edgeMask(prev: boolean, next: boolean): string | undefined {
	if (!prev && !next) return undefined
	const start = prev ? "transparent, black 32px" : "black"
	const end = next ? "black calc(100% - 32px), transparent" : "black"
	return `linear-gradient(to right, ${start}, ${end})`
}

function ScrollButton({
	label,
	disabled,
	onClick,
	children,
}: {
	label: string
	disabled: boolean
	onClick: () => void
	children: ReactNode
}) {
	return (
		<button
			type="button"
			aria-label={label}
			disabled={disabled}
			onClick={onClick}
			className={css({
				display: "inline-flex",
				alignItems: "center",
				justifyContent: "center",
				width: "7",
				height: "7",
				borderRadius: "md",
				border: "1px solid {colors.border.default}",
				color: "fg.default",
				bg: "transparent",
				cursor: "pointer",
				transition: "color 0.15s ease, border-color 0.15s ease",
				_hover: { borderColor: "border.emphasized" },
				_disabled: {
					color: "fg.subtle",
					opacity: 0.4,
					cursor: "default",
					_hover: { borderColor: "border.default" },
				},
			})}
		>
			{children}
		</button>
	)
}

function LiveCallCard({ call }: { call: LiveCall }) {
	const data = useFragment(MyCallsTabFragment, call)
	return <CallCard call={data} />
}
