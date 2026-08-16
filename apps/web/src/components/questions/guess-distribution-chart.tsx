import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"

type Bucket = { value: number; count: number }

type Props = {
	buckets: Bucket[]
	averageGuess: number | null
}

// Hand-rolled bar chart, keyed by guess value rather than time - unlike the
// question's overall call volume (see CallVolumeStats), a numeric_guess's
// spread of guesses is meaningful with just a handful of calls, so this one
// keeps its bar row rather than collapsing to plain stats. Bin width is a
// flat 1 (nearest integer) - see Question.guessDistribution for why, and its
// known limitation for fractional-scale stats.
export function GuessDistributionChart({ buckets, averageGuess }: Props) {
	if (buckets.length === 0) return null

	const maxCount = Math.max(...buckets.map((b) => b.count), 1)

	return (
		<VStack gap="1.5" alignItems="stretch">
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
							flex: "1",
							minWidth: "1",
							// Capped, not flex:1 alone - with few distinct guesses so
							// far, an uncapped flex-grow bar would stretch into one
							// giant block instead of a legible bar.
							maxWidth: "7",
							// border.emphasized (track, #3E3E3A) - the design system's
							// reserved progress/chart-bar color. bg.subtle is a nested
							// *surface* color (cardMuted), meant for an empty track
							// sitting almost flush with the card, not a filled bar.
							background: "border.emphasized",
							borderRadius: "1px 1px 0 0",
						})}
						style={{ height: `${(bucket.count / maxCount) * 100}%` }}
					/>
				))}
			</HStack>
			<HStack gap="1" className={css({ overflow: "hidden" })}>
				{buckets.map((bucket) => (
					<span
						key={bucket.value}
						className={css({
							flex: "1",
							minWidth: "0",
							maxWidth: "7",
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
			{averageGuess !== null && (
				<span
					className={css({
						fontFamily: "mono",
						fontSize: "2xs",
						color: "fg.subtle",
					})}
				>
					field average:{" "}
					{Number.isInteger(averageGuess)
						? averageGuess
						: averageGuess.toFixed(1)}
				</span>
			)}
		</VStack>
	)
}
