import { questionShapeSchema } from "@called-my-shot/schemas"
import { css, cx } from "styled-system/css"
import { Grid } from "styled-system/jsx"
import type { QuestionShape } from "#/graphql/generated/graphql"
import {
	questionShapeDescription,
	questionShapeIcon,
	questionShapeLabel,
} from "#/lib/question-labels"

type QuestionShapeValue = (typeof questionShapeSchema.options)[number]

// questionShapeLabel/Icon/Description are keyed by the GraphQL enum's
// SCREAMING_SNAKE_CASE names (matching every other consumer, e.g. question
// cards); this form works in the lowercase values the schema/mutation
// resolve to (see questions.ts in packages/schemas), so lookups convert at
// the boundary rather than duplicating the maps in a second casing.
function toEnumKey(value: QuestionShapeValue): QuestionShape {
	return value.toUpperCase() as QuestionShape
}

// player_season_award/team_season_award/player_award_finalists/team_vs_team
// can only ever be posted as official (see ADMIN_ONLY_SHAPES in
// packages/schemas/src/questions.ts) - the award shapes have no fixed
// nominee list to curate from, and team_vs_team is derived 1:1 from a synced
// game, so a regular creator posting one risks a duplicate matchup question.
// Hidden from the picker entirely for a non-admin rather than shown and left
// to fail validation on submit.
const ADMIN_ONLY_SHAPES: readonly QuestionShapeValue[] = [
	"team_vs_team",
	"player_season_award",
	"team_season_award",
	"player_award_finalists",
]

type Props = {
	value: QuestionShapeValue | null
	onChange: (shape: QuestionShapeValue) => void
	isAdmin: boolean
}

export function QuestionTypePicker({ value, onChange, isAdmin }: Props) {
	const shapes = questionShapeSchema.options.filter(
		(shape) => isAdmin || !ADMIN_ONLY_SHAPES.includes(shape),
	)
	return (
		<Grid
			gridTemplateColumns={{ base: "1fr", sm: "1fr 1fr", lg: "1fr 1fr 1fr" }}
			gap="2.5"
			aria-label="Question shape"
		>
			{shapes.map((shape) => {
				const key = toEnumKey(shape)
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
