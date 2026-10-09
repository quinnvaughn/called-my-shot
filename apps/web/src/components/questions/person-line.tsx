import type { ReactNode } from "react"
import { css } from "styled-system/css"
import { HStack } from "styled-system/jsx"
import type { FlairData } from "#/components/ui/flair"
import { Identity } from "#/components/ui/identity"
import { CallAge } from "./call-timestamp"

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
	// When the call was made, as an ISO timestamp. Set, the action word
	// becomes "called 3h ago".
	calledAt?: string
}

// Who called it - CallCard/CallRow only. QuestionCard's own reference design
// dropped the equivalent "asked by" credit line entirely; the title carries
// enough on its own there.
export function PersonLine({
	name,
	username,
	avatarUrl,
	flair,
	badge,
	calledAt,
}: Props) {
	return (
		<HStack justify="space-between" alignItems="center" gap="2" flexWrap="wrap">
			<Identity
				name={name}
				username={username}
				avatarUrl={avatarUrl}
				flair={flair}
				trailing={
					calledAt ? (
						<span className={css({ whiteSpace: "nowrap" })}>
							called <CallAge iso={calledAt} />
						</span>
					) : (
						"called"
					)
				}
			/>
			{badge}
		</HStack>
	)
}
