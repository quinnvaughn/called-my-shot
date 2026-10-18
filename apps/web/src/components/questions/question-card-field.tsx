import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { match } from "ts-pattern"
import {
	type ImagePlayer,
	type ImageTeam,
	PlayerOrTeamImage,
} from "#/components/ui/player-or-team-image"
import type { QuestionShape } from "#/graphql/generated/graphql"
import { formatGuess } from "#/lib/field-signal"
import {
	isOverUnderQuestionShape,
	optionDisplayLabel,
} from "#/lib/question-labels"
import { GuessDistributionChart } from "./guess-distribution-chart"
import { OptionRow } from "./option-row"

type Option = {
	id: string
	label: string
	fieldPct: number | null
	callCount: number
	// The model's chance this option hits, on a priced one.
	modelHitRate?: number | null
	// Set when the option is a real player or team, for its image.
	player?: ImagePlayer | null
	team?: ImageTeam | null
}

type Props = {
	shape: QuestionShape
	options: Option[]
	ouLine: number | null
	isRateStat: boolean
	guessDistribution: { value: number; count: number }[]
	averageGuess: number | null
	// The viewer's own call: its picked option ids for an option shape, its
	// guessValue for a numeric one. Empty / null when they haven't called.
	pickedOptionIds: string[]
	myGuess: number | null
	// How many winners a season award asks callers to pick. Above 1, the card
	// shows that many rows so the field's whole lineup is visible.
	picksRequired: number | null
	// Each row's win and miss, while the question can still be called.
	pointsFor?: (optionId: string) => { win: number; lose: number }
	// Each row is a way into the question with that option already picked
	// (see QuestionCard's pickable). Omitted, the rows are a read-only view of
	// the field.
	pickable?: boolean
}

// A single-pick stat leader or award question carries a whole roster or
// league of options, so the card shows only the most-called few.
const MAX_RANKED_ROWS = 3

// How the field is calling a still-unsettled question, shown on QuestionCard
// itself: every option's share for a two-way question, the top few for a
// many-option one, and the guess histogram for a numeric one.
export function QuestionCardField({
	shape,
	options,
	ouLine,
	isRateStat,
	guessDistribution,
	averageGuess,
	pickedOptionIds,
	myGuess,
	picksRequired,
	pointsFor,
	pickable = false,
}: Props) {
	const renderRow = (option: Option) => (
		<OptionRow
			key={option.id}
			image={<PlayerOrTeamImage player={option.player} team={option.team} />}
			label={optionDisplayLabel(
				option.label,
				isOverUnderQuestionShape(shape),
				ouLine,
				isRateStat,
			)}
			fieldPct={option.fieldPct}
			count={option.callCount}
			selected={pickedOptionIds.includes(option.id)}
			// Orange only where a tap on the row starts a call with it. Otherwise
			// the card isn't the picker, so there's no action for orange to
			// point at.
			tone={pickable ? "pick" : "field"}
			targetId={pickable ? option.id : undefined}
			points={pointsFor?.(option.id)}
		/>
	)

	return match(shape)
		.with(
			"TEAM_VS_TEAM",
			"TEAM_VS_TEAM_SEASON",
			"PLAYER_VS_PLAYER",
			"PLAYER_VS_PLAYER_SEASON",
			"YES_NO_PROP",
			"PLAYER_STAT_OVER_UNDER",
			"TEAM_STAT_OVER_UNDER",
			"PLAYER_SEASON_STAT_OVER_UNDER",
			"TEAM_SEASON_STAT_OVER_UNDER",
			"GAME_TOTAL_OVER_UNDER",
			() => (
				<VStack gap="2" alignItems="stretch">
					{options.map(renderRow)}
				</VStack>
			),
		)
		.with(
			"PLAYER_GAME_STAT_LEADER",
			"PLAYER_SEASON_STAT_LEADER",
			"PLAYER_TEAM_SEASON_STAT_LEADER",
			"PLAYER_SEASON_AWARD",
			"TEAM_SEASON_AWARD",
			"PLAYER_AWARD_FINALISTS",
			() => {
				// Same ranking as OptionFieldBreakdown: most-called first, uncalled
				// options dropped unless they're the viewer's own pick. A pickable
				// card keeps every option instead, so there's something to start
				// from before anyone has called it, and on a priced pool goes by
				// the model's chance like OptionPickerList, so the rows on offer
				// are the favorites rather than whoever was called first.
				const isPriced = options.some((option) => option.modelHitRate != null)
				const ranked = pickable
					? [...options].sort((a, b) =>
							isPriced
								? (b.modelHitRate ?? -1) - (a.modelHitRate ?? -1)
								: b.callCount - a.callCount,
						)
					: options
							.filter(
								(option) =>
									option.callCount > 0 || pickedOptionIds.includes(option.id),
							)
							.sort((a, b) => b.callCount - a.callCount)
				if (ranked.length === 0) {
					return (
						<span className={css({ textStyle: "metaSm", color: "fg.subtle" })}>
							No callers yet
						</span>
					)
				}
				const isMultiPick = picksRequired !== null && picksRequired > 1
				const rowCount = isMultiPick ? picksRequired : MAX_RANKED_ROWS
				const top = ranked.slice(0, rowCount)
				const picksBelowTop = ranked
					.slice(rowCount)
					.filter((option) => pickedOptionIds.includes(option.id))
				// A single pick outside the top rows gets a row of its own. A
				// multi-pick caller can have several out there, so those collapse
				// to one line of names rather than doubling the card's length.
				const rows = isMultiPick ? top : [...top, ...picksBelowTop]
				const hiddenCount = ranked.length - top.length - picksBelowTop.length
				return (
					<VStack gap="2" alignItems="stretch">
						{rows.map(renderRow)}
						{isMultiPick && picksBelowTop.length > 0 && (
							<span
								className={css({ textStyle: "metaSm", color: "fg.subtle" })}
							>
								Also yours:{" "}
								<span className={css({ color: "secondary.default" })}>
									{picksBelowTop.map((option) => option.label).join(", ")}
								</span>
							</span>
						)}
						{hiddenCount > 0 && (
							<span
								className={css({ textStyle: "metaSm", color: "fg.subtle" })}
							>
								+{hiddenCount} more
								{pickable && " on the question page"}
							</span>
						)}
					</VStack>
				)
			},
		)
		.with(
			"PLAYER_STAT_NUMERIC_GUESS",
			"TEAM_STAT_NUMERIC_GUESS",
			"TEAM_SEASON_STAT_NUMERIC_GUESS",
			() => (
				<VStack gap="2" alignItems="stretch">
					<GuessDistributionChart
						buckets={guessDistribution}
						averageGuess={averageGuess}
						myGuess={myGuess}
						tone="field"
						isRateStat={isRateStat}
						compact
					/>
					{myGuess !== null && (
						<HStack gap="1.5" alignItems="baseline">
							<span
								className={css({
									textStyle: "labelSm",
									color: "fg.subtle",
								})}
							>
								Your guess
							</span>
							<span
								className={css({
									fontFamily: "mono",
									fontSize: "sm",
									fontWeight: "bold",
									color: "secondary.default",
								})}
							>
								{formatGuess(myGuess, isRateStat)}
							</span>
						</HStack>
					)}
				</VStack>
			),
		)
		.exhaustive()
}
