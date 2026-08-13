import { css } from "styled-system/css"
import type { QuestionType } from "#/graphql/generated/graphql"
import { questionTypeIcon, questionTypeLabel } from "#/lib/question-labels"

type Props = {
	type: QuestionType
	size?: number
}

export function QuestionTypeIcon({ type, size = 12 }: Props) {
	const Icon = questionTypeIcon[type]
	return (
		<div
			role="img"
			aria-label={questionTypeLabel[type]}
			title={questionTypeLabel[type]}
			className={css({
				display: "inline-flex",
				alignItems: "center",
				justifyContent: "center",
				color: "fg.subtle",
				backgroundColor: "bg.subtle",
				padding: "1.5",
				borderRadius: "sm",
				flexShrink: "0",
			})}
		>
			<Icon size={size} />
		</div>
	)
}
