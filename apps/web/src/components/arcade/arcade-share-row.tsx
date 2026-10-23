import { useState } from "react"
import { FiCheck, FiLink, FiShare } from "react-icons/fi"
import { HStack } from "styled-system/jsx"
import { Button } from "#/components/ui/button"
import { IconButton, iconButtonClass } from "#/components/ui/icon-button"
import { PostOnXLink } from "#/components/ui/post-on-x-link"
import type { ShareMethod } from "#/lib/share-links"
import { useTagShareUrl } from "#/lib/share-links"
import { ARCADE_GAME_INFO, type ArcadeGameKey } from "./arcade-game-info"

// A finished arcade game's link, whose preview is the squares. "Share result"
// opens the share sheet where there is one and copies the link where there
// isn't.
export function ArcadeShareRow({
	game,
	url,
	title,
	tweetText,
	onShared,
}: {
	game: ArcadeGameKey
	url: string
	title: string
	tweetText: string
	onShared: (method: ShareMethod) => void
}) {
	// Which button just copied the link, so only that one says so.
	const [copied, setCopied] = useState<"share" | "icon" | null>(null)
	const campaign = ARCADE_GAME_INFO[game].campaign
	const tagShareUrl = useTagShareUrl(campaign)

	async function copy(from: "share" | "icon") {
		await navigator.clipboard.writeText(tagShareUrl(url, "clipboard"))
		onShared("clipboard")
		setCopied(from)
		setTimeout(() => setCopied(null), 1200)
	}

	async function share() {
		if ("share" in navigator) {
			try {
				await navigator.share({ title, url: tagShareUrl(url, "native") })
				onShared("native")
				return
			} catch {
				// Dismissed: copying below still works.
			}
		}
		await copy("share")
	}

	return (
		<HStack gap="2" flexWrap="wrap">
			<Button variant="light" onClick={() => void share()}>
				{copied === "share" ? <FiCheck aria-hidden /> : <FiShare aria-hidden />}
				{copied === "share" ? "Link copied" : "Share result"}
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
		</HStack>
	)
}
