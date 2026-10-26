import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { button } from "#/components/ui/button"
import { pluralize } from "#/lib/pluralize"

type Props = {
	draftClass: { title: string; answerCount: number }
	onChange: () => void
}

// The class being redrafted, with the way back to choosing another.
export function ChosenClassSummary({ draftClass, onChange }: Props) {
	return (
		<HStack
			gap="3"
			className={css({
				padding: "3",
				borderRadius: "lg",
				border: "1px solid {colors.border.default}",
				bg: "bg.surface",
			})}
		>
			<VStack gap="0.5" alignItems="flex-start" minWidth="0" flex="1">
				<span
					className={css({
						fontFamily: "heading",
						fontSize: "lg",
						lineHeight: "1.2",
					})}
				>
					{draftClass.title}
				</span>
				<span className={css({ textStyle: "meta", color: "fg.muted" })}>
					{draftClass.answerCount}{" "}
					{pluralize(draftClass.answerCount, "redraft")} so far
				</span>
			</VStack>
			<button
				type="button"
				onClick={onChange}
				className={button({ variant: "outline", size: "sm" })}
			>
				Change class
			</button>
		</HStack>
	)
}
