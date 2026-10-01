import { type ReactNode, useState } from "react"
import { FiCheck, FiLink, FiShare } from "react-icons/fi"
import { css } from "styled-system/css"
import { HStack } from "styled-system/jsx"
import { PostOnXLink } from "#/components/ui/post-on-x-link"

export type ShareMethod = "clipboard" | "native" | "x"

type Props = {
	url: string
	tweetText: string
	shareTitle: string
	onShared: (method: ShareMethod) => void
}

const iconButtonClass = css({
	display: "inline-flex",
	alignItems: "center",
	justifyContent: "center",
	width: { base: "11", sm: "9" },
	height: { base: "11", sm: "9" },
	borderRadius: "md",
	border: "1px solid {colors.border.default}",
	color: "fg.default",
	cursor: "pointer",
	transition: "background-color 0.15s ease",
	_hover: { backgroundColor: "bg.subtle" },
})

// Copy, native share and Post on X as one row of icon buttons, for a card
// footer where sharing is one thing among several.
export function ShareIconRow({ url, tweetText, shareTitle, onShared }: Props) {
	const [copied, setCopied] = useState(false)

	function handleCopy() {
		navigator.clipboard.writeText(url)
		onShared("clipboard")
		setCopied(true)
		setTimeout(() => setCopied(false), 1200)
	}

	async function handleNativeShare() {
		try {
			await navigator.share({ title: shareTitle, url })
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
			{typeof navigator !== "undefined" && "share" in navigator && (
				<IconButton label="Share" onClick={handleNativeShare}>
					<FiShare size={15} />
				</IconButton>
			)}
			<PostOnXLink
				text={tweetText}
				url={url}
				onClick={() => onShared("x")}
				iconClassName={iconButtonClass}
			/>
		</HStack>
	)
}

function IconButton({
	label,
	onClick,
	children,
}: {
	label: string
	onClick: () => void
	children: ReactNode
}) {
	return (
		<button
			type="button"
			aria-label={label}
			title={label}
			onClick={onClick}
			className={iconButtonClass}
		>
			{children}
		</button>
	)
}
