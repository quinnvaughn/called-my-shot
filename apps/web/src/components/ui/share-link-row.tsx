import { VStack } from "styled-system/jsx"
import { CopyLinkRow } from "#/components/ui/copy-link-row"
import { PostOnXLink } from "#/components/ui/post-on-x-link"
import { ShareIconRow } from "#/components/ui/share-icon-row"
import { SITE_HOST, SITE_ORIGIN } from "#/lib/meta"
import type { ShareCampaign, ShareMethod } from "#/lib/share-links"

type Props = {
	// Site-relative, with a leading slash. The row builds the absolute url
	// and the scheme-less one the field shows.
	path: string
	campaign: ShareCampaign
	// Omitted where posting to X isn't something anyone would do with the
	// link, which leaves just Copy and the native share sheet.
	tweetText?: string
	shareTitle: string
	// "full" is the link in a field, Copy, and a Post on X button. "icons" is
	// one row of icon buttons, for a card footer where sharing is one thing
	// among several.
	layout?: "full" | "icons"
	// Analytics belongs to the caller, which knows what's being shared.
	onShared: (method: ShareMethod) => void
}

export function ShareLinkRow({
	path,
	campaign,
	tweetText,
	shareTitle,
	layout = "full",
	onShared,
}: Props) {
	const url = `${SITE_ORIGIN}${path}`

	if (layout === "icons") {
		return (
			<ShareIconRow
				url={url}
				campaign={campaign}
				tweetText={tweetText}
				shareTitle={shareTitle}
				onShared={onShared}
			/>
		)
	}

	return (
		<VStack gap="3" alignItems="stretch">
			<CopyLinkRow
				url={url}
				campaign={campaign}
				displayUrl={`${SITE_HOST}${path}`}
				shareTitle={shareTitle}
				onCopied={() => onShared("clipboard")}
				onNativeShared={() => onShared("native")}
			/>
			{tweetText && (
				<PostOnXLink
					text={tweetText}
					url={url}
					campaign={campaign}
					onClick={() => onShared("x")}
				/>
			)}
		</VStack>
	)
}
