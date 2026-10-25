import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { button } from "#/components/ui/button"
import { TeamBadge } from "#/components/ui/team-badge"
import { pluralize } from "#/lib/pluralize"
import { promptScope } from "#/lib/prompt-scope"

type Props = {
	prompt: {
		title: string
		answerCount: number
		league: { abbreviation: string } | null
		positions: readonly string[]
		fromYear: number | null
		toYear: number | null
		team: {
			abbreviation: string
			color: string
			logoUrl: string | null
		} | null
	}
	onChange: () => void
}

// The prompt being answered, with the way back to choosing another.
export function ChosenPromptSummary({ prompt, onChange }: Props) {
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
			{prompt.team && (
				<TeamBadge
					abbreviation={prompt.team.abbreviation}
					color={prompt.team.color}
					logoUrl={prompt.team.logoUrl}
				/>
			)}
			<VStack gap="0.5" alignItems="flex-start" minWidth="0" flex="1">
				<span
					className={css({
						fontFamily: "heading",
						fontSize: "lg",
						lineHeight: "1.2",
						overflowWrap: "anywhere",
					})}
				>
					{prompt.title}
				</span>
				<span className={css({ textStyle: "meta", color: "fg.muted" })}>
					{promptScope({ ...prompt, team: null })} · {prompt.answerCount}{" "}
					{pluralize(prompt.answerCount, "Rushmore")} so far
				</span>
			</VStack>
			<button
				type="button"
				onClick={onChange}
				className={button({ variant: "outline", size: "sm" })}
			>
				Change prompt
			</button>
		</HStack>
	)
}
