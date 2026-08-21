import type { ReactNode } from "react"
import { HStack } from "styled-system/jsx"
import { Identity } from "#/components/ui/identity"

type Props = {
	name: string
	username: string
	// CallCard/CallRow's status slot (open lock line / LOCKED badge / win-loss
	// result badge) - has nowhere else to sit now that the pick section is a
	// bare list, so it rides along with the identity line that names who the
	// call belongs to.
	badge?: ReactNode
}

// Who called it - CallCard/CallRow only. QuestionCard's own reference design
// dropped the equivalent "asked by" credit line entirely; the title carries
// enough on its own there.
export function PersonLine({ name, username, badge }: Props) {
	return (
		<HStack justify="space-between" alignItems="center" gap="2" flexWrap="wrap">
			<Identity name={name} username={username} trailing="called" />
			{badge}
		</HStack>
	)
}
