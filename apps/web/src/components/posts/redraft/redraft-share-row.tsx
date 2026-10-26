import { HStack } from "styled-system/jsx"
import { ShareLinkRow } from "#/components/ui/share-link-row"
import { track } from "#/lib/analytics"
import { surname } from "#/lib/shared-picks"
import { ShareImageButton } from "../share-image-button"

type Props = {
	postId: string
	// The readable address on its share image, /redraft/{class}/{author}.
	path: string
	// "2003 NBA Draft".
	classTitle: string
	authorUsername: string
	own: boolean
	// Slot order.
	pickNames: string[]
}

// How many picks the posted text names before it trails off.
const NAMED = 3

// Sharing a public redraft: its link, and the picture people post. A group's
// redrafts stay in the group and never get this row.
export function RedraftShareRow({
	postId,
	path,
	classTitle,
	authorUsername,
	own,
	pickNames,
}: Props) {
	const subject = own
		? `My redraft of the ${classTitle}`
		: `@${authorUsername}'s redraft of the ${classTitle}`
	const top = pickNames
		.slice(0, NAMED)
		.map((name, i) => `${i + 1}. ${surname(name)}`)
		.join(", ")
	return (
		<HStack gap="2">
			<ShareLinkRow
				layout="icons"
				path={path}
				campaign="redraft"
				shareTitle={subject}
				tweetText={`${subject}: ${top}${pickNames.length > NAMED ? "…" : "."}`}
				onShared={(method) =>
					track("redraft_link_shared", { postId, own, method })
				}
			/>
			<ShareImageButton
				imagePath={`/share/redraft/${encodeURIComponent(postId)}/portrait`}
				fileName={`${classTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-redraft.png`}
			/>
		</HStack>
	)
}
