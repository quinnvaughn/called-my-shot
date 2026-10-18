import { CHAIN_MAX_LINKS } from "@called-my-shot/scoring"
import { Flex } from "styled-system/jsx"
import type { ChainPhase } from "#/graphql/generated/graphql"
import {
	CHAIN_BONUS_PCT,
	type ChainLinkData,
	multiplierLabel,
	oddsMultiplierLabel,
} from "#/lib/chains"
import { ChainPoints, ChainPointsArrow } from "./chain-points"
import { ChainStat } from "./chain-stat"

type Props = {
	phase: ChainPhase
	links: ChainLinkData[]
	// The viewer's own link, when it's in.
	mine: ChainLinkData | null
	// What a new link's multiplier would be, for someone not in yet.
	joinMultiplier: number
	breakerUsername: string | null
}

type Range = [number, number]

// A win as it can be stated: the call's own result once it's in, or what it
// pays if right while it's still open.
function winRange(link: ChainLinkData): Range | null {
	const call = link.call
	if (!call) return null
	if (link.outcome === "HIT" && call.totalPoints !== null) {
		return [call.totalPoints, call.totalPoints]
	}
	return call.payout ? [call.payout.winLow, call.payout.winHigh] : null
}

// What the chain does to the viewer's call, as its points before and after:
// "+107 → +428", "+107 → 0". A miss just takes its usual loss.
function yourCall(
	phase: ChainPhase,
	mine: ChainLinkData,
	breakerUsername: string | null,
): { before: Range; after: Range | null; note: string } | null {
	if (mine.outcome === "MISS") {
		const points = mine.call?.totalPoints
		return points != null
			? {
					before: [points, points],
					after: null,
					note: "Your miss counts as usual. The chain adds nothing.",
				}
			: null
	}
	const win = winRange(mine)
	if (!win) return null
	if (phase === "BROKEN") {
		return {
			before: win,
			after: [0, 0],
			note: breakerUsername
				? `@${breakerUsername} broke it, so your hit scores 0.`
				: "It broke, so your hit scores 0.",
		}
	}
	const held: Range = [
		Math.round(win[0] * mine.multiplier),
		Math.round(win[1] * mine.multiplier),
	]
	return {
		before: win,
		after: held,
		note:
			phase === "HELD"
				? "Every link hit."
				: mine.outcome === "HIT"
					? "Riding on the rest. Any miss wipes it to 0."
					: "If every link hits. Any miss and your hit scores 0.",
	}
}

// The stakes in one row: how many links, how likely it is to hold, and what
// it means for the viewer.
export function ChainStakes({
	phase,
	links,
	mine,
	joinMultiplier,
	breakerUsername,
}: Props) {
	const counted = links.filter((link) => link.outcome !== "VOID")
	const holdChance = counted.reduce(
		(product, link) => product * link.hitChance,
		1,
	)

	const you = (() => {
		if (
			mine &&
			(counted.length >= 2 || phase === "HELD" || phase === "BROKEN")
		) {
			const call = yourCall(phase, mine, breakerUsername)
			return call ? (
				<ChainStat
					label="Your call"
					value={
						<>
							<ChainPoints range={call.before} />
							{call.after && (
								<>
									<ChainPointsArrow />
									<ChainPoints range={call.after} />
								</>
							)}
						</>
					}
					note={call.note}
				/>
			) : null
		}
		if (mine) {
			return (
				<ChainStat
					label="Your call"
					value="Needs a link"
					note="It counts once someone else adds one"
				/>
			)
		}
		if (phase === "OPEN" && links.length > 0) {
			return (
				<ChainStat
					label="Join at"
					value={multiplierLabel(joinMultiplier)}
					note={`The odds plus ${CHAIN_BONUS_PCT}%, if every link hits`}
					tone="secondary"
				/>
			)
		}
		return null
	})()

	return (
		<Flex gap="3" flexWrap="wrap">
			<ChainStat
				label="Links"
				value={String(links.length)}
				note={
					phase !== "OPEN"
						? null
						: links.length >= CHAIN_MAX_LINKS
							? "Full"
							: `Room for ${CHAIN_MAX_LINKS - links.length} more`
				}
			/>
			{counted.length >= 2 && (
				<ChainStat
					label="Odds it holds"
					value={`1 in ${Math.round(1 / holdChance)}`}
				/>
			)}
			{mine &&
				mine.outcome !== "MISS" &&
				counted.length >= 2 &&
				phase !== "VOID" &&
				phase !== "CALLED_OFF" && (
					<ChainStat
						label="Your multiplier"
						value={multiplierLabel(mine.multiplier)}
						note={`Odds pay ${oddsMultiplierLabel(mine.multiplier)}, plus ${CHAIN_BONUS_PCT}% for chaining`}
						tone="secondary"
					/>
				)}
			{you}
		</Flex>
	)
}
