import { Tag } from "#/components/ui/tag"
import type { ChainLinkData } from "#/lib/chains"
import { isGameInPlay } from "#/lib/game-status"

// How one link stands in the chain.
export function ChainLinkStatus({ link }: { link: ChainLinkData }) {
	if (link.isBreaker) {
		return (
			<Tag size="sm" variant="danger">
				Broke it
			</Tag>
		)
	}
	if (link.outcome === "HIT") {
		return (
			<Tag size="sm" variant="success">
				Hit
			</Tag>
		)
	}
	if (link.outcome === "MISS") {
		return (
			<Tag size="sm" variant="danger">
				Missed
			</Tag>
		)
	}
	if (link.outcome === "VOID") return <Tag size="sm">Voided</Tag>
	return link.game && isGameInPlay(link.game) ? (
		<Tag size="sm" variant="secondary">
			Live
		</Tag>
	) : (
		<Tag size="sm">Pending</Tag>
	)
}
