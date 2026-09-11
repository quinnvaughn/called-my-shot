import { css, cx } from "styled-system/css"
import { HStack } from "styled-system/jsx"
import { Avatar } from "./avatar"

type IdentityProps = {
	name: string
	username: string
	size?: "xs" | "sm" | "md"
	// Trailing action word ("called"/"asked") - CallCard/CallRow's "who did
	// this" usage appends one; the detail page's plain creator credit leaves
	// it unset.
	trailing?: string
	// Below md, puts the @handle on its own line under the name and lets both
	// wrap, for narrow label/value rows where the full identity should stay
	// readable rather than truncate. From md up it's the usual single line.
	stackOnMobile?: boolean
}

const truncateText = css({
	minWidth: "0",
	overflow: "hidden",
	textOverflow: "ellipsis",
	whiteSpace: "nowrap",
})

const wrapOnMobileText = css({
	minWidth: "0",
	overflowWrap: { base: "anywhere", md: "normal" },
	overflow: { base: "visible", md: "hidden" },
	textOverflow: { md: "ellipsis" },
	whiteSpace: { base: "normal", md: "nowrap" },
})

// The avatar + name + @handle cluster shown wherever a card credits someone
// (a question's creator, a call's answerer, etc.) - one place to keep it
// consistent instead of re-typing the same three elements everywhere.
export function Identity({
	name,
	username,
	size = "xs",
	trailing,
	stackOnMobile = false,
}: IdentityProps) {
	const textFit = stackOnMobile ? wrapOnMobileText : truncateText
	const nameEl = (
		<span className={cx(css({ fontSize: "xs", fontWeight: "medium" }), textFit)}>
			{name}
		</span>
	)
	const handleEl = (
		<span
			className={cx(
				css({ fontSize: "xs", color: "fg.muted", fontFamily: "mono" }),
				textFit,
			)}
		>
			@{username}
		</span>
	)

	return (
		<HStack gap="2" minWidth="0">
			<Avatar size={size} name={name} />
			{stackOnMobile ? (
				<div
					className={css({
						display: "flex",
						flexDirection: { base: "column", md: "row" },
						alignItems: { base: "flex-start", md: "center" },
						gap: { base: "0", md: "2" },
						minWidth: "0",
					})}
				>
					{nameEl}
					{handleEl}
				</div>
			) : (
				<>
					{nameEl}
					{handleEl}
				</>
			)}
			{trailing && (
				<span
					className={css({
						fontSize: "xs",
						color: "fg.subtle",
						flexShrink: "0",
					})}
				>
					{trailing}
				</span>
			)}
		</HStack>
	)
}
