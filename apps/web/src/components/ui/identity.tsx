import { css } from "styled-system/css"
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
}

// The avatar + name + @handle cluster shown wherever a card credits someone
// (a question's creator, a call's answerer, etc.) - one place to keep it
// consistent instead of re-typing the same three elements everywhere.
export function Identity({
	name,
	username,
	size = "xs",
	trailing,
}: IdentityProps) {
	return (
		<HStack gap="2">
			<Avatar size={size} name={name} />
			<span className={css({ fontSize: "xs", fontWeight: "medium" })}>
				{name}
			</span>
			<span
				className={css({
					fontSize: "xs",
					color: "fg.muted",
					fontFamily: "mono",
				})}
			>
				@{username}
			</span>
			{trailing && (
				<span className={css({ fontSize: "xs", color: "fg.subtle" })}>
					{trailing}
				</span>
			)}
		</HStack>
	)
}
