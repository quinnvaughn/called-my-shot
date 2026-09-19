import { css, cx } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { Avatar } from "./avatar"
import { Flair, type FlairData } from "./flair"

type IdentityProps = {
	name: string
	username: string
	// The chip this person is wearing, or null if they haven't picked one.
	// Rendered on its own line under the name, never inline with it.
	flair?: FlairData | null
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

// The @handle is the one thing that names an account unambiguously, so it is
// never cut off: it holds its full width and the display name beside it gives
// way instead. Two accounts can share a display name; "@qu..." identifies
// nobody.
const handleText = css({
	flexShrink: "0",
	whiteSpace: "nowrap",
})

const handleWrapOnMobile = css({
	overflowWrap: { base: "anywhere", md: "normal" },
	whiteSpace: { base: "normal", md: "nowrap" },
	flexShrink: { md: "0" },
})

// The avatar + name + @handle cluster shown wherever a card credits someone
// (a question's creator, a call's answerer, etc.) - one place to keep it
// consistent instead of re-typing the same three elements everywhere.
export function Identity({
	name,
	username,
	flair,
	size = "xs",
	trailing,
	stackOnMobile = false,
}: IdentityProps) {
	const textFit = stackOnMobile ? wrapOnMobileText : truncateText
	const nameEl = (
		<span
			className={cx(css({ fontSize: "xs", fontWeight: "medium" }), textFit)}
		>
			{name}
		</span>
	)
	const handleEl = (
		<span
			className={cx(
				css({ fontSize: "xs", color: "fg.muted", fontFamily: "mono" }),
				stackOnMobile ? handleWrapOnMobile : handleText,
			)}
		>
			@{username}
		</span>
	)
	const trailingEl = trailing ? (
		<span
			className={css({
				fontSize: "xs",
				color: "fg.subtle",
				flexShrink: "0",
			})}
		>
			{trailing}
		</span>
	) : null

	// Name, handle and the action word, on the line they have always shared.
	const identityLine = stackOnMobile ? (
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
			{trailingEl}
		</div>
	) : (
		<HStack gap="2" minWidth="0">
			{nameEl}
			{handleEl}
			{trailingEl}
		</HStack>
	)

	// The flair gets its own line rather than a slot between the name and the
	// handle. Inline, it was competing for width with the two things that
	// actually identify someone, and on a phone it either truncated all three
	// or had to drop its label to fit. On its own line it shows the full name
	// of what it is and costs the row nothing horizontally.
	return (
		<HStack gap="2" minWidth="0" alignItems={flair ? "flex-start" : "center"}>
			<Avatar size={size} name={name} />
			{flair ? (
				<VStack gap="1" alignItems="flex-start" minWidth="0">
					{identityLine}
					<Flair flair={flair} />
				</VStack>
			) : (
				identityLine
			)}
		</HStack>
	)
}
