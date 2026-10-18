import { VStack } from "styled-system/jsx"
import { type ChainEventData, ChainEventRow } from "./chain-event-row"

// What happened to the chain, oldest first.
export function ChainActivity({ events }: { events: ChainEventData[] }) {
	return (
		<VStack gap="2" alignItems="stretch">
			{events.map((event) => (
				<ChainEventRow
					key={`${event.kind}:${event.at}:${event.link?.id ?? ""}`}
					event={event}
				/>
			))}
		</VStack>
	)
}
