import { isAdminOnlyShape, questionShapeSchema } from "@called-my-shot/schemas"
import { css, cx } from "styled-system/css"
import { Grid } from "styled-system/jsx"
import {
	questionShapeDescription,
	questionShapeIcon,
	questionShapeLabel,
	toQuestionShape,
} from "#/lib/question-labels"

type QuestionShapeValue = (typeof questionShapeSchema.options)[number]

type Props = {
	value: QuestionShapeValue | null
	onChange: (shape: QuestionShapeValue) => void
	isAdmin: boolean
}

export function QuestionTypePicker({ value, onChange, isAdmin }: Props) {
	const shapes = questionShapeSchema.options.filter(
		// Hidden from a non-admin's picker entirely rather than shown and left
		// to fail validation on submit - these can only be posted as official.
		(shape) => isAdmin || !isAdminOnlyShape(shape),
	)
	return (
		<Grid
			gridTemplateColumns={{ base: "1fr", sm: "1fr 1fr", lg: "1fr 1fr 1fr" }}
			gap="2.5"
			aria-label="Question shape"
		>
			{shapes.map((shape) => {
				// questionShapeLabel/Icon/Description are keyed by the GraphQL
				// enum's SCREAMING_SNAKE_CASE names (matching every other consumer,
				// e.g. question cards); this form works in the lowercase values the
				// schema/mutation resolve to (see questions.ts in packages/schemas),
				// so lookups convert at the boundary rather than duplicating the
				// maps in a second casing.
				const key = toQuestionShape(shape)
				const Icon = questionShapeIcon[key]
				const selected = value === shape
				return (
					<button
						key={shape}
						type="button"
						aria-pressed={selected}
						onClick={() => onChange(shape)}
						className={cx(
							css({
								display: "flex",
								flexDirection: "column",
								alignItems: "flex-start",
								gap: "2.5",
								textAlign: "left",
								bg: "bg.surface",
								border: "1px solid {colors.border.default}",
								borderRadius: "2xl",
								padding: "4",
								transition: "border-color 0.15s ease",
								_hover: {
									border: "1px solid {colors.border.emphasized}",
									cursor: "pointer",
								},
							}),
							selected &&
								css({
									border: "1px solid {colors.primary.default}",
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
							{questionShapeLabel[key]}
						</span>
						<span
							className={css({
								fontSize: "xs",
								lineHeight: "relaxed",
								color: "fg.subtle",
							})}
						>
							{questionShapeDescription[key]}
						</span>
					</button>
				)
			})}
		</Grid>
	)
}
