import { VStack } from "styled-system/jsx"
import { SectionLabel } from "#/components/ui/section-label"
import { type ChainListItem, ChainListRow } from "./chain-list-row"

// One group of chains in the list, under its heading. Nothing when empty.
export function ChainListSection({
	title,
	groupId,
	chains,
}: {
	title: string
	groupId: string
	chains: ChainListItem[]
}) {
	if (chains.length === 0) return null
	return (
		<VStack gap="3" alignItems="stretch">
			<SectionLabel>{title}</SectionLabel>
			{chains.map((chain) => (
				<ChainListRow key={chain.id} groupId={groupId} chain={chain} />
			))}
		</VStack>
	)
}
