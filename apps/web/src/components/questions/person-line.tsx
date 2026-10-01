import type { ReactNode } from "react"
import { HStack } from "styled-system/jsx"
import type { FlairData } from "#/components/ui/flair"
import { Identity } from "#/components/ui/identity"

type Props = {
	name: string
	username: string
	avatarUrl?: string | null
	flair?: FlairData | null
	// CallCard/CallRow's status slot (where the call stands, plus a redo
	// badge) - has nowhere else to sit now that the pick section is a bare
	// list, so it rides along with the identity line that names who the call
	// belongs to.
	badge?: ReactNode
}

// Who called it - CallCard/CallRow only. QuestionCard's own reference design
// dropped the equivalent "asked by" credit line entirely; the title carries
// enough on its own there.
export function PersonLine({ name, username, avatarUrl, flair, badge }: Props) {
	return (
		<HStack justify="space-between" alignItems="center" gap="2" flexWrap="wrap">
			<Identity
				name={name}
				username={username}
				avatarUrl={avatarUrl}
				flair={flair}
				trailing="called"
			/>
			{badge}
		</HStack>
	)
}
