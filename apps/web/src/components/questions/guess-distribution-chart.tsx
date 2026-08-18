import { FiZap } from "react-icons/fi"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { formatGuess } from "#/lib/field-signal"

type Bucket = { value: number; count: number }

type Props = {
	buckets: Bucket[]
	averageGuess: number | null
	// The viewer's own guess (live while they're still picking, their locked
	// call's value afterward) - whichever bucket it falls on gets called out
	// in the primary color, same as every other "this one's you" highlight in
	// the picker (a selected team row, a selected multi-select chip). null
	// while there's nothing to highlight yet; a value outside the chart's own
	// range (buckets only cover where the field has actually landed) just
	// doesn't match any bucket, so nothing lights up - it isn't a bug, there's
	// nothing on the chart to point at.
	myGuess?: number | null
}

// Below this many guesses, the bar chart is just 1-2 bars at full height -
// technically accurate but reads as far more signal than it actually is.
// Same "be the first" empty-state voice QuestionCallsList already uses for
// the calls list on this same page, just gated on guess volume instead.
const MIN_GUESSES_FOR_CHART = 5

// A real stat display (count + label + nudge), not a generic <EmptyState>
// line of text - a numeric_guess with 0-4 guesses still has a real number
// worth putting on the page, it just isn't enough to plot as a chart yet.
function LowVolumeGuesses({ totalGuesses }: { totalGuesses: number }) {
	return (
		<VStack
			gap="1"
			alignItems="center"
			className={css({ padding: "5", textAlign: "center" })}
		>
			<span
				className={css({
					fontFamily: "mono",
					fontSize: "2xl",
					color: "fg.default",
				})}
			>
				{totalGuesses}
			</span>
			<span
				className={css({
					fontFamily: "mono",
					fontSize: "3xs",
					letterSpacing: "wide",
					color: "fg.subtle",
					textTransform: "uppercase",
				})}
			>
				Guesses so far
			</span>
			<HStack gap="1.5" alignItems="center" className={css({ paddingTop: "2" })}>
				<FiZap size={13} className={css({ color: "primary.default" })} />
				<span
					className={css({
						fontFamily: "mono",
						fontSize: "xs",
						color: "primary.default",
					})}
				>
					{totalGuesses === 0
						? "No one's guessed yet - set the tone."
						: "Early days - be one of the first to guess this one."}
				</span>
			</HStack>
		</VStack>
	)
}

// Hand-rolled bar chart, keyed by guess value rather than time - unlike the
// question's overall call volume (see CallVolumeStats), a numeric_guess's
// spread of guesses is meaningful with just a handful of calls, so this one
// keeps its bar row rather than collapsing to plain stats. Bin width is a
// flat 1 (nearest integer) - see Question.guessDistribution for why, and its
// known limitation for fractional-scale stats.
export function GuessDistributionChart({
	buckets,
	averageGuess,
	myGuess = null,
}: Props) {
	const totalGuesses = buckets.reduce((sum, bucket) => sum + bucket.count, 0)

	if (totalGuesses < MIN_GUESSES_FOR_CHART) {
		return <LowVolumeGuesses totalGuesses={totalGuesses} />
	}

	const maxCount = Math.max(...buckets.map((b) => b.count), 1)
	const lo = buckets[0].value
	const hi = buckets[buckets.length - 1].value
	// Where the average line sits along the chart's own value range, not the
	// count axis - same "position by value, not by index" math the mockup
	// uses, since buckets are evenly spaced by value already.
	const avgMarkerPct =
		averageGuess !== null && hi > lo
			? ((averageGuess - lo) / (hi - lo)) * 100
			: null
	// Which bucket the average line actually lands on, so that bar can be
	// picked out too - not just the thin line above it. Buckets are always
	// whole numbers (bin width 1, see the class comment), so round to match.
	// Same "no match, no highlight" rule as myGuess below: an average that
	// rounds to a value with zero guesses has no bar to point at, which is
	// correct, not a bug.
	const avgBucketValue = averageGuess !== null ? Math.round(averageGuess) : null

	return (
		<VStack gap="1.5" alignItems="stretch">
			<div
				className={css({ position: "relative" })}
				style={{ paddingTop: avgMarkerPct !== null ? "18px" : undefined }}
			>
				{avgMarkerPct !== null && (
					<div
						className={css({ position: "absolute", background: "fg.muted" })}
						style={{ left: `${avgMarkerPct}%`, top: 0, bottom: 0, width: "1px" }}
					>
						<span
							className={css({
								fontFamily: "mono",
								fontSize: "4xs",
								color: "fg.muted",
								whiteSpace: "nowrap",
							})}
							style={{
								position: "absolute",
								top: "-16px",
								left: "50%",
								transform: "translateX(-50%)",
							}}
						>
							field avg
						</span>
					</div>
				)}
				<HStack
					gap="1"
					alignItems="flex-end"
					className={css({ height: "10", overflow: "hidden" })}
				>
					{buckets.map((bucket) => (
						<div
							key={bucket.value}
							title={`${bucket.value} · ${bucket.count} guess${bucket.count === 1 ? "" : "es"}`}
							className={css({
								position: "relative",
								flex: "1",
								minWidth: "1",
								// border.emphasized (track, #3E3E3A) - the design system's
								// reserved progress/chart-bar color for an unhighlighted bar.
								// myGuess wins the solid primary.default fill when it lands on
								// this bucket; failing that, the bucket the field average
								// rounds to still gets picked out via the paler primary.subtle
								// tint, so a spectator with no call of their own (viewer-status-
								// card's "Locked" state, no myGuess to show) still sees where
								// the field landed, not just a flat gray chart.
								background:
									bucket.value === myGuess
										? "primary.default"
										: bucket.value === avgBucketValue
											? "primary.subtle"
											: "border.emphasized",
								borderRadius: "1px 1px 0 0",
							})}
							style={{ height: `${(bucket.count / maxCount) * 100}%` }}
						/>
					))}
				</HStack>
			</div>
			<HStack gap="1" className={css({ overflow: "hidden" })}>
				{buckets.map((bucket) => (
					<span
						key={bucket.value}
						className={css({
							flex: "1",
							minWidth: "0",
							textAlign: "center",
							fontFamily: "mono",
							fontSize: "3xs",
							color: "fg.subtle",
						})}
					>
						{bucket.value}
					</span>
				))}
			</HStack>
			<span
				className={css({
					fontFamily: "mono",
					fontSize: "3xs",
					letterSpacing: "wide",
					color: "fg.subtle",
					textTransform: "uppercase",
					textAlign: "center",
				})}
			>
				{totalGuesses} guess{totalGuesses === 1 ? "" : "es"}
				{averageGuess !== null && ` · avg ${formatGuess(averageGuess)}`}
			</span>
		</VStack>
	)
}
