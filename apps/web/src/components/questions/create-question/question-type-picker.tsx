import { questionTypeSchema } from "@called-my-shot/schemas"
import { css, cx } from "styled-system/css"
import { Grid } from "styled-system/jsx"
import type { QuestionType } from "#/graphql/generated/graphql"
import {
	questionTypeDescription,
	questionTypeIcon,
	questionTypeLabel,
} from "#/lib/question-labels"

type QuestionTypeValue = (typeof questionTypeSchema.options)[number]

// questionTypeLabel/Icon/Description are keyed by the GraphQL enum's
// SCREAMING_SNAKE_CASE names (matching every other consumer, e.g. question
// cards); this form works in the lowercase values the schema/mutation
// resolve to (see questions.ts in packages/schemas), so lookups convert at
// the boundary rather than duplicating the maps in a second casing.
function toEnumKey(value: QuestionTypeValue): QuestionType {
	return value.toUpperCase() as QuestionType
}

type Props = {
	value: QuestionTypeValue | null
	onChange: (type: QuestionTypeValue) => void
}

export function QuestionTypePicker({ value, onChange }: Props) {
	return (
		<Grid
			gridTemplateColumns={{ base: "1fr", sm: "1fr 1fr", lg: "1fr 1fr 1fr" }}
			gap="2.5"
			aria-label="Question type"
		>
			{questionTypeSchema.options.map((type) => {
				const key = toEnumKey(type)
				const Icon = questionTypeIcon[key]
				const selected = value === type
				return (
					<button
						key={type}
						type="button"
						aria-pressed={selected}
						onClick={() => onChange(type)}
						className={cx(
							css({
								display: "flex",
								flexDirection: "column",
								alignItems: "flex-start",
								gap: "2.5",
								textAlign: "left",
								bg: "bg.surface",
								border: "1px solid",
								borderColor: "border.default",
								borderRadius: "2xl",
								padding: "4",
								transition: "border-color 0.15s ease",
								_hover: { borderColor: "border.emphasized", cursor: "pointer" },
							}),
							selected &&
								css({
									borderColor: "primary.default",
									bg: "primary.subtle",
								}),
						)}
					>
						<span
							className={css({
								display: "flex",
								alignItems: "center",
								justifyContent: "center",
								width: "8",
								height: "8",
								borderRadius: "lg",
								bg: selected ? "bg.surface" : "bg.subtle",
								color: selected ? "primary.default" : "fg.subtle",
							})}
						>
							<Icon size={15} />
						</span>
						<span className={css({ fontSize: "sm", fontWeight: "semibold" })}>
							{questionTypeLabel[key]}
						</span>
						<span
							className={css({
								fontSize: "xs",
								lineHeight: "relaxed",
								color: "fg.subtle",
							})}
						>
							{questionTypeDescription[key]}
						</span>
					</button>
				)
			})}
		</Grid>
	)
}
