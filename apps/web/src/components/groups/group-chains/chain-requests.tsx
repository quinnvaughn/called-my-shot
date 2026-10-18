import { VStack } from "styled-system/jsx"
import { SectionLabel } from "#/components/ui/section-label"
import type { ChainLinkData } from "#/lib/chains"
import { ChainRequestRow } from "./chain-request-row"

// The starter's queue of people asking in. Nothing when it's empty.
export function ChainRequests({ requests }: { requests: ChainLinkData[] }) {
	if (requests.length === 0) return null
	return (
		<VStack gap="3" alignItems="stretch">
			<SectionLabel>Waiting on you</SectionLabel>
			{requests.map((link) => (
				<ChainRequestRow key={link.id} link={link} />
			))}
		</VStack>
	)
}
