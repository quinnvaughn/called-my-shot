import { css } from "styled-system/css"
import { pluralize } from "#/lib/pluralize"
import { promptScope } from "#/lib/prompt-scope"
import { choiceRow } from "./composer-styles"
import { PromptGlyph } from "./prompt-glyph"

type Props = {
	prompt: {
		code: string
		title: string
		answerCount: number
		league: { abbreviation: string } | null
		positions?: readonly string[]
		fromYear?: number | null
		toYear?: number | null
		team: {
			abbreviation: string
			color: string
			logoUrl: string | null
		} | null
	}
	onChoose: (code: string) => void
}

// One prompt to answer, with who its picks come from and how many
// Rushmores it already has.
export function PromptRow({ prompt, onChoose }: Props) {
	return (
		<button
			type="button"
			className={choiceRow}
			onClick={() => onChoose(prompt.code)}
		>
			<PromptGlyph league={prompt.league} team={prompt.team} />
			<span
				className={css({
					flex: 1,
					minWidth: 0,
					fontSize: "sm",
					fontWeight: "semibold",
					overflowWrap: "anywhere",
				})}
			>
				{prompt.title}
			</span>
			<span
				className={css({
					flexShrink: 0,
					textStyle: "meta",
					color: "fg.muted",
				})}
			>
				{/* The team's logo already says which team. */}
				{promptScope({ ...prompt, team: null })} · {prompt.answerCount}{" "}
				{pluralize(prompt.answerCount, "Rushmore")}
			</span>
		</button>
	)
}
