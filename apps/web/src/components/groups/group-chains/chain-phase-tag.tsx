import { match } from "ts-pattern"
import { Tag } from "#/components/ui/tag"
import type { ChainPhase } from "#/graphql/generated/graphql"

// Where a chain stands. Held and broken are outcomes, so they take success
// and danger; a chain still in play is picked out in secondary.
export function ChainPhaseTag({ phase }: { phase: ChainPhase }) {
	return match(phase)
		.with("OPEN", () => (
			<Tag size="sm" variant="secondary">
				Taking links
			</Tag>
		))
		.with("LIVE", () => (
			<Tag size="sm" variant="secondary">
				Playing out
			</Tag>
		))
		.with("HELD", () => (
			<Tag size="sm" variant="success">
				Held
			</Tag>
		))
		.with("BROKEN", () => (
			<Tag size="sm" variant="danger">
				Broken
			</Tag>
		))
		.with("VOID", () => <Tag size="sm">Didn't count</Tag>)
		.with("CALLED_OFF", () => <Tag size="sm">Called off</Tag>)
		.exhaustive()
}
