import type { MouseEvent } from "react"
import { FaXTwitter } from "react-icons/fa6"
import { css } from "styled-system/css"
import { HStack } from "styled-system/jsx"
import { match } from "ts-pattern"
import {
	buildAndroidIntentUrl,
	openAppWithWebFallback,
} from "#/lib/app-deep-link"
import { detectDevicePlatform } from "#/lib/device-platform"
import { type ShareCampaign, useTagShareUrl } from "#/lib/share-links"

type Props = {
	text: string
	url: string
	// Omitted for invite links, whose code already attributes the visit.
	campaign?: ShareCampaign
	onClick: () => void
	// Replaces the labelled button with the caller's own icon-button class,
	// for a row of share icons.
	iconClassName?: string
}

export function PostOnXLink({
	text,
	url: rawUrl,
	campaign,
	onClick,
	iconClassName,
}: Props) {
	const url = useTagShareUrl(campaign)(rawUrl, "x")
	// x.com/intent/post rather than twitter.com/intent/tweet: the old host
	// still 302s, but that adds a hop to the path a share takes. text and url
	// stay separate params so X joins them itself and doesn't count the url
	// against the character budget.
	const intentUrl = `https://x.com/intent/post?text=${encodeURIComponent(
		text,
	)}&url=${encodeURIComponent(url)}`

	// The web intent URL doesn't reliably hand off to the X app on phones, and
	// the web client it lands on usually isn't signed in. The app's own scheme
	// has no separate url param, so the link rides at the end of the message.
	const appMessage = encodeURIComponent(`${text} ${url}`)

	const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
		onClick()
		match(detectDevicePlatform())
			.with("ios", () => {
				event.preventDefault()
				openAppWithWebFallback(
					`twitter://post?message=${appMessage}`,
					intentUrl,
				)
			})
			.with("android", () => {
				event.preventDefault()
				window.location.href = buildAndroidIntentUrl({
					scheme: "twitter",
					pathAndQuery: `post?message=${appMessage}`,
					packageName: "com.twitter.android",
					fallbackUrl: intentUrl,
				})
			})
			.with("desktop", () => {})
			.exhaustive()
	}

	if (iconClassName) {
		return (
			<a
				href={intentUrl}
				target="_blank"
				rel="noopener noreferrer"
				onClick={handleClick}
				aria-label="Post on X"
				title="Post on X"
				className={iconClassName}
			>
				<FaXTwitter size={14} />
			</a>
		)
	}

	return (
		<a
			href={intentUrl}
			// A real navigation to x.com, not a popup this app should try to
			// manage.
			target="_blank"
			rel="noopener noreferrer"
			onClick={handleClick}
			className={css({
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				gap: "2",
				paddingBlock: "2.5",
				borderRadius: "md",
				border: "1px solid {colors.border.default}",
				fontFamily: "mono",
				fontSize: "xs",
				letterSpacing: "wide",
				textTransform: "uppercase",
				color: "fg.default",
				textDecoration: "none",
				cursor: "pointer",
				transition: "background-color 0.15s ease",
				_hover: { backgroundColor: "bg.subtle" },
			})}
		>
			<HStack gap="2" alignItems="center">
				<FaXTwitter size={14} />
				Post on X
			</HStack>
		</a>
	)
}
