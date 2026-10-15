import { FiRotateCcw } from "react-icons/fi"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"

export function ReferralRedoCard({ username }: { username: string }) {
	return (
		<VStack
			alignItems="stretch"
			gap="2"
			className={css({
				gridArea: "redo",
				border: "2px dashed {colors.fg.subtle}",
				borderRadius: "lg",
				padding: "5",
			})}
		>
			<HStack gap="2" alignItems="center">
				<FiRotateCcw aria-hidden size={18} />
				<h2 className={css({ fontSize: "lg", fontWeight: "semibold" })}>
					You both get a free redo
				</h2>
			</HStack>
			<p className={css({ lineHeight: "relaxed", color: "fg.body" })}>
				A redo changes one call after you've made it, any time before that
				question locks. Yours lands the moment you sign up. {`@${username}`}{" "}
				gets theirs when you make your first call.
			</p>
		</VStack>
	)
}
