import { match } from "ts-pattern"
import type { ChainPhase } from "#/graphql/generated/graphql"
import type { ChainLinkData } from "#/lib/chains"

// The chain's state, said as the page's title.
export function chainHeadline(
	phase: ChainPhase,
	links: ChainLinkData[],
	breakerUsername: string | null,
): string {
	return match(phase)
		.with("OPEN", () =>
			links.length < 2 ? "Needs one more link" : "Taking links",
		)
		.with("LIVE", () => {
			const landed = links.filter((link) => link.outcome === "HIT").length
			return `Playing out · ${landed} of ${links.length} in`
		})
		.with("HELD", () => "The chain held")
		.with("BROKEN", () =>
			breakerUsername
				? `@${breakerUsername} broke the chain`
				: "The chain broke",
		)
		.with("VOID", () => "Didn't count")
		.with("CALLED_OFF", () => "Called off")
		.exhaustive()
}
