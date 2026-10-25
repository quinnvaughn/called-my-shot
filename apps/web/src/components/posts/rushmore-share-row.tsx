import { HStack } from "styled-system/jsx"
import { ShareLinkRow } from "#/components/ui/share-link-row"
import { track } from "#/lib/analytics"
import { ShareImageButton } from "./share-image-button"

type Props = {
	postId: string
	// The readable address on its share image, /rushmore/{prompt}/{author}.
	path: string
	promptTitle: string
	authorUsername: string
	own: boolean
	pickNames: string[]
}

// Sharing a public Rushmore: its link, and the picture people post. A
// group's Rushmores stay in the group and never get this row.
export function RushmoreShareRow({
	postId,
	path,
	promptTitle,
	authorUsername,
	own,
	pickNames,
}: Props) {
	const subject = own
		? `My Mount Rushmore: ${promptTitle}`
		: `@${authorUsername}'s Mount Rushmore: ${promptTitle}`
	return (
		<HStack gap="2">
			<ShareLinkRow
				layout="icons"
				path={path}
				campaign="rushmore"
				shareTitle={subject}
				tweetText={`${subject}: ${pickNames.join(", ")}.`}
				onShared={(method) =>
					track("rushmore_link_shared", { postId, own, method })
				}
			/>
			<ShareImageButton
				postId={postId}
				fileName={`${promptTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.png`}
			/>
		</HStack>
	)
}
