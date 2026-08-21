import { FaLock } from "react-icons/fa6"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"

// Stands in for the pick + case once viewerCanSeePick is false - identity is
// still shown above this (see PersonLine), so the message here is only
// ever about the pick, never about whether the call happened at all.
export function CallLockedBox({ name }: { name: string }) {
	return (
		<HStack
			gap="2.5"
			alignItems="center"
			className={css({
				background: "bg.canvas",
				border: "1px dashed {colors.border.default}",
				borderRadius: "md",
				padding: "3",
			})}
		>
			<FaLock
				size={16}
				className={css({ color: "fg.subtle", flexShrink: "0" })}
			/>
			<VStack gap="0" alignItems="flex-start">
				<span className={css({ fontSize: "xs", color: "fg.muted" })}>
					Make your call to see {name}'s pick
				</span>
				<span
					className={css({
						fontFamily: "mono",
						fontSize: "2xs",
						color: "fg.subtle",
					})}
				>
					and their case, once you've made your own
				</span>
			</VStack>
		</HStack>
	)
}
