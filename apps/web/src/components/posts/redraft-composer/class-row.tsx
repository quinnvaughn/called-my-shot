import { css } from "styled-system/css"
import { pluralize } from "#/lib/pluralize"
import { choiceRow } from "../rushmore-composer/composer-styles"
import { PromptGlyph } from "../rushmore-composer/prompt-glyph"

type Props = {
	draftClass: {
		code: string
		title: string
		answerCount: number
		league: { abbreviation: string } | null
	}
	onChoose: (code: string) => void
}

// One draft class to redraft, with how many redrafts it already has.
export function ClassRow({ draftClass, onChoose }: Props) {
	return (
		<button
			type="button"
			className={choiceRow}
			onClick={() => onChoose(draftClass.code)}
		>
			<PromptGlyph league={draftClass.league} team={null} />
			<span
				className={css({
					flex: 1,
					minWidth: 0,
					fontSize: "sm",
					fontWeight: "semibold",
				})}
			>
				{draftClass.title}
			</span>
			<span
				className={css({ flexShrink: 0, textStyle: "meta", color: "fg.muted" })}
			>
				{draftClass.answerCount} {pluralize(draftClass.answerCount, "redraft")}
			</span>
		</button>
	)
}
