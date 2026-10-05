import { FiZap } from "react-icons/fi"
import { css, cx } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { formatGuess } from "#/lib/field-signal"
import { pluralize } from "#/lib/pluralize"

type Bucket = { value: number; count: number }

const tickLabelClass = css({
	fontFamily: "mono",
	fontSize: "3xs",
	color: "fg.subtle",
})

type Props = {
	buckets: Bucket[]
	averageGuess: number | null
	// The viewer's own guess (live while they're still picking, their locked
	// call's value afterward) - whichever bucket it falls on gets called out
	// in the tone's color (see tone below), same as every other "this one's
	// you" highlight (a selected team row, a selected multi-select chip). null
	// while there's nothing to highlight yet; a value outside the chart's own
	// range (buckets only cover where the field has actually landed) just
	// doesn't match any bucket, so nothing lights up - it isn't a bug, there's
	// nothing on the chart to point at.
	myGuess?: number | null
	// "pick" (the default) while the viewer is still guessing: their bucket
	// in the primary orange. "record" once the call is made: their bucket in
	// the secondary blue, and the field average in a neutral tint. "field"
	// is pick's scheme in the blue, for a read-only view with nothing to act
	// on (QuestionCard): orange is reserved for actions.
	tone?: "pick" | "record" | "field"
	// True only for a rate stat (batting average, ERA) - every value below
	// displays padded to a fixed 3 decimals when set, since a trailing zero
	// is meaningful there (".300", never ".3") - see formatGuess.
	isRateStat?: boolean
	// The in-list card version: labels only the two ends of the range, drops
	// the summary line (the card's footer carries the caller count), and
	// renders nothing below MIN_GUESSES_FOR_CHART instead of the low-volume
	// block.
	compact?: boolean
}

// Below this many guesses, the bar chart is just 1-2 bars at full height -
// technically accurate but reads as far more signal than it actually is.
// Same "be the first" empty-state voice QuestionCallsList already uses for
// the calls list on this same page, just gated on guess volume instead.
const MIN_GUESSES_FOR_CHART = 5

// A real stat display (count + label + nudge), not a generic <EmptyState>
// line of text - a numeric-guess shape with 0-4 guesses still has a real number
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
				{pluralize(totalGuesses, "guess", "guesses")} so far
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
// question's overall call volume (see CallVolumeStats), a numeric-guess shape's
// spread of guesses is meaningful with just a handful of calls, so this one
// keeps its bar row rather than collapsing to plain stats. Bin width matches
// whatever the server bucketed by (a flat 1 for a counting stat, a small
// decimal amount for a rate stat) - see Question.guessDistribution.
export function GuessDistributionChart({
	buckets,
	averageGuess,
	myGuess = null,
	tone = "pick",
	isRateStat = false,
	compact = false,
}: Props) {
	const totalGuesses = buckets.reduce((sum, bucket) => sum + bucket.count, 0)

	if (totalGuesses < MIN_GUESSES_FOR_CHART) {
		return compact ? null : <LowVolumeGuesses totalGuesses={totalGuesses} />
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
	// picked out too - not just the thin line above it. Snapped to whichever
	// existing bucket is nearest, rather than re-deriving the server's bin
	// width here - works the same whether that width is a flat 1 (a counting
	// stat) or a small decimal amount (a rate stat) without this component
	// needing to know it.
	const avgBucketValue =
		averageGuess !== null && buckets.length > 0
			? buckets.reduce((closest, bucket) =>
					Math.abs(bucket.value - averageGuess) <
					Math.abs(closest.value - averageGuess)
						? bucket
						: closest,
				).value
			: null

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
							title={`${formatGuess(bucket.value, isRateStat)} · ${bucket.count} ${pluralize(bucket.count, "guess", "guesses")}`}
							className={css({
								position: "relative",
								flex: "1",
								minWidth: "1",
								// border.emphasized (track, #3E3E3A) - the design system's
								// reserved progress/chart-bar color for an unhighlighted bar.
								// myGuess wins the solid fill (orange while picking, blue as
								// a record) when it lands on this bucket; failing that, the
								// bucket the field average rounds to still gets picked out via
								// a paler tint, so a spectator with no call of their own (viewer-status-
								// card's "Locked" state, no myGuess to show) still sees where
								// the field landed, not just a flat gray chart.
								background:
									bucket.value === myGuess
										? tone === "pick"
											? "primary.default"
											: "secondary.default"
										: bucket.value === avgBucketValue
											? tone === "record"
												? "fg.subtle"
												: tone === "pick"
													? "primary.subtle"
													: "secondary.subtle"
											: "border.emphasized",
								borderRadius: "1px 1px 0 0",
							})}
							style={{ height: `${(bucket.count / maxCount) * 100}%` }}
						/>
					))}
				</HStack>
			</div>
			{compact ? (
				<HStack justify="space-between" gap="2">
					<span className={tickLabelClass}>{formatGuess(lo, isRateStat)}</span>
					<span className={tickLabelClass}>{formatGuess(hi, isRateStat)}</span>
				</HStack>
			) : (
				<HStack gap="1" className={css({ overflow: "hidden" })}>
					{buckets.map((bucket) => (
						<span
							key={bucket.value}
							className={cx(
								tickLabelClass,
								css({ flex: "1", minWidth: "0", textAlign: "center" }),
							)}
						>
							{formatGuess(bucket.value, isRateStat)}
						</span>
					))}
				</HStack>
			)}
			{!compact && (
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
					{totalGuesses} {pluralize(totalGuesses, "guess", "guesses")}
					{averageGuess !== null &&
						` · avg ${formatGuess(averageGuess, isRateStat)}`}
				</span>
			)}
		</VStack>
	)
}
