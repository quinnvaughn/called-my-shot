import { type ReactNode, useState } from "react"
import { FiCheck, FiLink, FiShare } from "react-icons/fi"
import { css } from "styled-system/css"
import { HStack } from "styled-system/jsx"
import { Button } from "#/components/ui/button"
import { IconButton, iconButtonClass } from "#/components/ui/icon-button"
import { PostOnXLink } from "#/components/ui/post-on-x-link"
import {
	type ShareCampaign,
	type ShareMethod,
	useTagShareUrl,
} from "#/lib/share-links"

// The buttons under a DarePanel. "Send to friends" opens the share sheet
// where there is one and copies the link where there isn't; Copy and Post on
// X sit beside it, then anything the caller adds (a Save image button).
export function SendToFriendsRow({
	url,
	campaign,
	title,
	tweetText,
	onShared,
	children,
}: {
	// Absolute.
	url: string
	campaign: ShareCampaign
	// What the share sheet calls it.
	title: string
	tweetText: string
	// Analytics belongs to the caller, which knows what's being shared.
	onShared: (method: ShareMethod) => void
	children?: ReactNode
}) {
	// Which button just copied the link, so only that one says so.
	const [copied, setCopied] = useState<"send" | "icon" | null>(null)
	const tagShareUrl = useTagShareUrl(campaign)

	async function copy(from: "send" | "icon") {
		await navigator.clipboard.writeText(tagShareUrl(url, "clipboard"))
		onShared("clipboard")
		setCopied(from)
		setTimeout(() => setCopied(null), 1200)
	}

	async function send() {
		if ("share" in navigator) {
			try {
				await navigator.share({ title, url: tagShareUrl(url, "native") })
				onShared("native")
				return
			} catch {
				// Dismissed: copying below still works.
			}
		}
		await copy("send")
	}

	return (
		<HStack gap="2" flexWrap="wrap">
			<Button
				variant="solid"
				className={css({ flex: { base: "1", md: "0 0 auto" } })}
				onClick={() => void send()}
			>
				{copied === "send" ? <FiCheck aria-hidden /> : <FiShare aria-hidden />}
				{copied === "send" ? "Link copied" : "Send to friends"}
			</Button>
			<IconButton
				label={copied === "icon" ? "Link copied" : "Copy link"}
				onClick={() => void copy("icon")}
			>
				{copied === "icon" ? <FiCheck size={15} /> : <FiLink size={15} />}
			</IconButton>
			<PostOnXLink
				text={tweetText}
				url={url}
				campaign={campaign}
				onClick={() => onShared("x")}
				iconClassName={iconButtonClass}
			/>
			{children}
		</HStack>
	)
}
