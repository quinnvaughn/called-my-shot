import { FaTriangleExclamation } from "react-icons/fa6"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"

type Props = {
	onSwitchToOpenField: () => void
}

// A nudge, not a gate - a curated shortlist for an inherently open-ended
// outcome (an award, a title) risks leaving out the real winner, which makes
// the question uncallable-correctly for everyone if that happens (see
// optionsOpenField on the questions table). Shown for the categories where
// that shape is common; the creator can just keep adding options past it if
// they're confident the list really is the complete field.
export function OpenFieldNudge({ onSwitchToOpenField }: Props) {
	return (
		<HStack
			gap="2"
			alignItems="flex-start"
			className={css({
				backgroundColor: "warning.subtle",
				borderRadius: "md",
				padding: "3",
			})}
		>
			<FaTriangleExclamation
				size={13}
				className={css({
					color: "warning.default",
					flexShrink: "0",
					marginTop: "1",
				})}
			/>
			<VStack gap="1" alignItems="flex-start">
				<span
					className={css({
						fontSize: "xs",
						color: "fg.body",
						lineHeight: "relaxed",
					})}
				>
					If the eventual winner isn't on this list, nobody can call it
					correctly - not even you.
				</span>
				<button
					type="button"
					onClick={onSwitchToOpenField}
					className={css({
						fontFamily: "mono",
						fontSize: "2xs",
						letterSpacing: "wide",
						color: "warning.default",
						cursor: "pointer",
						_hover: { textDecoration: "underline" },
					})}
				>
					Switch to open field →
				</button>
			</VStack>
		</HStack>
	)
}
