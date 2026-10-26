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
	pickNames: string[]
}

// Sharing someone else's public Rushmore: its link, and the picture people
// post. The author's own gets RushmoreDare. A group's Rushmores stay in the
// group and never get this row.
export function RushmoreShareRow({
	postId,
	path,
	promptTitle,
	authorUsername,
	pickNames,
}: Props) {
	const subject = `@${authorUsername}'s Mount Rushmore: ${promptTitle}`
	return (
		<HStack gap="2">
			<ShareLinkRow
				layout="icons"
				path={path}
				campaign="rushmore"
				shareTitle={subject}
				tweetText={`${subject}: ${pickNames.join(", ")}.`}
				onShared={(method) =>
					track("rushmore_link_shared", { postId, own: false, method })
				}
			/>
			<ShareImageButton
				imagePath={`/share/rushmore/${encodeURIComponent(postId)}/portrait`}
				fileName={`${promptTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.png`}
			/>
		</HStack>
	)
}
