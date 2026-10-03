import { css } from "styled-system/css"
import { Flex, VStack } from "styled-system/jsx"
import { Button } from "#/components/ui/button"
import { openModal } from "#/stores/modal-store"
import { type GloatAudience, GloatModal } from "./gloat-modal"

const promptClass = css({
	fontSize: "md",
	fontWeight: "semibold",
	color: "fg.default",
})

const subClass = css({
	fontSize: "sm",
	color: "fg.muted",
})

// The winning side of a fade, offered its one gloat. Same weight and spot as
// FadeCta: once a fade settles, this is the thing the page asks the winner to
// do.
export function GloatCta({ audience }: { audience: GloatAudience }) {
	const prompt =
		audience.kind === "doubters"
			? "You called it."
			: `Your fade on @${audience.username} hit.`
	const sub =
		audience.kind === "doubters"
			? audience.count === 1
				? "Your doubter was wrong. Send them a line."
				: `${audience.count} doubters were wrong. Send them all a line.`
			: "Send them a line."

	return (
		<Flex
			direction={{ base: "column", sm: "row" }}
			gap="4"
			alignItems={{ base: "stretch", sm: "center" }}
			justify="space-between"
			className={css({
				padding: "5",
				borderRadius: "lg",
				border: "1px solid {colors.border.default}",
				background: "bg.subtle",
			})}
		>
			<VStack gap="1" alignItems="flex-start">
				<span className={promptClass}>{prompt}</span>
				<span className={subClass}>{sub}</span>
			</VStack>
			<Button
				variant="solid"
				size="md"
				onClick={() => openModal(<GloatModal audience={audience} />)}
			>
				Gloat
			</Button>
		</Flex>
	)
}
