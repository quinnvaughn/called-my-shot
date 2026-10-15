import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import { PickList } from "#/components/questions/pick-list"
import { sideLabel } from "./styles"
import type { Entry } from "./types"

// What the creator called, above the form, so the viewer is calling against
// something they can see.
export function CreatorCall({
	username,
	call,
}: {
	username: string
	call: Entry["creatorCall"]
}) {
	return (
		<VStack
			gap="2"
			alignItems="stretch"
			className={css({
				padding: "3",
				borderRadius: "lg",
				backgroundColor: "bg.subtle",
			})}
		>
			<span className={sideLabel}>@{username}'s call</span>
			{call ? (
				<PickList call={call} />
			) : (
				<p className={css({ fontSize: "sm", color: "fg.muted" })}>
					Not called yet. It counts as 0 for them if it locks uncalled.
				</p>
			)}
		</VStack>
	)
}
