import { ClientOnly } from "@tanstack/react-router"
import { useState } from "react"
import { FiCheck, FiLink, FiShare } from "react-icons/fi"
import { HStack } from "styled-system/jsx"
import { PostOnXLink } from "#/components/ui/post-on-x-link"
import {
	type ShareCampaign,
	type ShareMethod,
	useTagShareUrl,
} from "#/lib/share-links"
import { IconButton, iconButtonClass } from "./icon-button"

type Props = {
	url: string
	campaign: ShareCampaign
	// Omitted where posting to X isn't something anyone would do with the
	// link, which leaves just Copy and the native share sheet.
	tweetText?: string
	shareTitle: string
	onShared: (method: ShareMethod) => void
}

// Copy, native share and Post on X as one row of icon buttons, for a card
// footer where sharing is one thing among several.
export function ShareIconRow({
	url,
	campaign,
	tweetText,
	shareTitle,
	onShared,
}: Props) {
	const [copied, setCopied] = useState(false)
	const tagShareUrl = useTagShareUrl(campaign)

	function handleCopy() {
		navigator.clipboard.writeText(tagShareUrl(url, "clipboard"))
		onShared("clipboard")
		setCopied(true)
		setTimeout(() => setCopied(false), 1200)
	}

	async function handleNativeShare() {
		try {
			await navigator.share({
				title: shareTitle,
				url: tagShareUrl(url, "native"),
			})
			onShared("native")
		} catch {
			// A dismissed share sheet rejects the same way a failure does, and
			// neither is worth surfacing: Copy still works.
		}
	}

	return (
		<HStack gap="2">
			<IconButton
				label={copied ? "Link copied" : "Copy link"}
				onClick={handleCopy}
			>
				{copied ? <FiCheck size={15} /> : <FiLink size={15} />}
			</IconButton>
			{/* Client-only: the server can't know whether the browser has a share
			    sheet, so rendering this during SSR mismatches on hydration. */}
			<ClientOnly>
				{typeof navigator !== "undefined" && "share" in navigator && (
					<IconButton label="Share" onClick={handleNativeShare}>
						<FiShare size={15} />
					</IconButton>
				)}
			</ClientOnly>
			{tweetText && (
				<PostOnXLink
					text={tweetText}
					url={url}
					campaign={campaign}
					onClick={() => onShared("x")}
					iconClassName={iconButtonClass}
				/>
			)}
		</HStack>
	)
}
