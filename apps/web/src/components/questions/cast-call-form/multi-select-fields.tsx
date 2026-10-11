import {
	basePointsFor,
	effectiveLossRate,
	isSeasonLongShape,
	seasonEarlyTierFor,
} from "@called-my-shot/scoring"
import { FiX } from "react-icons/fi"
import { css, cx } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import type { EntitySearchItem } from "#/components/questions/create-question/entity-search-field"
import { EntitySearchField } from "#/components/questions/create-question/entity-search-field"
import { Card } from "#/components/ui/card"
import { FieldLabel } from "#/components/ui/field-label"
import { PlayerOrTeamImage } from "#/components/ui/player-or-team-image"
import { Slider } from "#/components/ui/slider"
import { optionPointsPreview, previewCrowdPct } from "#/lib/scoring"
import { PointsPreview } from "../points-preview"
import { SeasonPlayNote } from "../season-play-note"
import { CaseField } from "./case-field"
import { OptionPickerList } from "./option-picker-list"
import type { CastCallFormState } from "./use-cast-call-form"

type Props = {
	callForm: CastCallFormState
}

// The exact same row list + pagination + total-count OptionFields shows for
// a single pick (see OptionPickerList) - here a row toggles into/out of
// `selections` instead of replacing it, that's the entire difference.
export function MultiSelectFields({ callForm }: Props) {
	const {
		question,
		shape,
		form,
		selections,
		multiSelectSearch,
		setMultiSelectSearch,
		convictionMode,
		setSplitMode,
		setSharedMode,
		sharedConviction,
		updateSharedConviction,
		addMultiSelectPick,
		removeMultiSelectPick,
	} = callForm

	if (!question) return null

	// Season-long shapes preview off games played so far, not rank - see
	// PointsPreview's own comment. Null for a game-scoped shape (or a
	// season-long one with no games synced yet, where seasonEarlyTierFor's own
	// zero-games guard lands on the same preseason ceiling either way).
	const earlyTier =
		isSeasonLongShape(shape) &&
		question.seasonGamesPlayed !== null &&
		question.seasonTotalGames !== null
			? seasonEarlyTierFor(
					question.seasonGamesPlayed,
					question.seasonTotalGames,
				)
			: undefined

	return (
		<VStack gap="5" alignItems="stretch">
			<VStack gap="1.5" alignItems="stretch">
				<HStack justify="space-between">
					<FieldLabel required>
						Make your {question.picksRequired} picks
					</FieldLabel>
					<span
						className={css({
							fontFamily: "mono",
							fontSize: "2xs",
							color: "fg.subtle",
						})}
					>
						{selections.length} / {question.picksRequired}
					</span>
				</HStack>

				<OptionPickerList
					options={question.options}
					shape={shape}
					ouLine={null}
					callCount={question.callCount}
					isSelected={(optionId) =>
						selections.some((s) => s.optionId === optionId)
					}
					onSelect={(optionId) =>
						selections.some((s) => s.optionId === optionId)
							? removeMultiSelectPick(optionId)
							: addMultiSelectPick(optionId)
					}
					pointsFor={(optionId) => {
						const option = question.options.find((o) => o.id === optionId)
						return option
							? optionPointsPreview(
									question,
									option,
									question.options.length,
									sharedConviction,
								)
							: { win: 0, lose: 0 }
					}}
					pointsConviction={sharedConviction}
				/>

				<EntitySearchField
					value={multiSelectSearch}
					onValueChange={setMultiSelectSearch}
					items={question.options
						.filter(
							(option) => !selections.some((s) => s.optionId === option.id),
						)
						.map(
							(option): EntitySearchItem => ({
								id: option.id,
								label: option.label,
								kind: "player",
								image: { player: option.player, team: option.team },
								meta:
									option.fieldPct !== null
										? `${Math.round(option.fieldPct)}%`
										: undefined,
							}),
						)}
					placeholder="Search to add…"
					clearOnSelect
					onSelectItem={(item) => addMultiSelectPick(item.id)}
				/>
			</VStack>

			<Card>
				<Card.Body>
					<VStack gap="3" alignItems="stretch">
						<HStack justify="space-between">
							<FieldLabel>Conviction</FieldLabel>
							<HStack gap="1">
								{(["shared", "split"] as const).map((mode) => (
									<button
										key={mode}
										type="button"
										onClick={
											mode === "shared"
												? setSharedMode
												: setSplitMode
										}
										className={cx(
											css({
												fontFamily: "mono",
												fontSize: "2xs",
												letterSpacing: "wide",
												color: "fg.subtle",
												border: "1px solid {colors.border.default}",
												borderRadius: "sm",
												padding: "{spacing.1} {spacing.2}",
												cursor: "pointer",
											}),
											convictionMode === mode &&
												css({
													color: "fg.default",
													border: "1px solid {colors.border.emphasized}",
												}),
										)}
									>
										{mode === "shared" ? "One for all" : "Per pick"}
									</button>
								))}
							</HStack>
						</HStack>
						{convictionMode === "shared" && (
							<VStack gap="1.5" alignItems="stretch">
								<HStack justify="space-between">
									<span
										className={css({
											fontFamily: "mono",
											fontSize: "2xs",
											color: "fg.subtle",
										})}
									>
										Applies to all picks
									</span>
									<span className={css({ fontFamily: "mono", fontSize: "xs" })}>
										{sharedConviction}%
									</span>
								</HStack>
								<Slider
									value={sharedConviction}
									onChange={updateSharedConviction}
									aria-label="Conviction for all picks"
								/>
							</VStack>
						)}

						{/* The picks themselves live inside this same card, not as a
						separate section above it - conviction (shared or per-pick) and
						what it's being applied to are one concept, not two. */}
						{selections.length > 0 ? (
							<VStack gap="2" alignItems="stretch">
								{selections.map((selection, index) => {
									const option = question.options.find(
										(o) => o.id === selection.optionId,
									)
									if (!option) return null
									return (
										<VStack
											key={selection.optionId}
											gap="1.5"
											alignItems="stretch"
											className={css({
												background: "bg.canvas",
												borderRadius: "md",
												padding: "3",
											})}
										>
											<HStack justify="space-between" gap="2">
												<HStack gap="2" alignItems="center" minWidth="0">
													<PlayerOrTeamImage
														player={option.player}
														team={option.team}
													/>
													<span
														className={css({
															fontSize: "sm",
															fontWeight: "medium",
														})}
													>
														{option.label}
													</span>
												</HStack>
												<button
													type="button"
													aria-label={`Remove ${option.label}`}
													onClick={() => removeMultiSelectPick(option.id)}
													className={css({
														display: "flex",
														alignItems: "center",
														justifyContent: "center",
														width: "6",
														height: "6",
														flexShrink: "0",
														borderRadius: "sm",
														color: "fg.subtle",
														cursor: "pointer",
														_hover: { color: "danger.default" },
													})}
												>
													<FiX size={13} />
												</button>
											</HStack>
											{convictionMode === "split" && (
												<HStack gap="2" alignItems="center">
													<Slider
														value={selection.conviction}
														onChange={(v) =>
															form.setValue(`selections.${index}.conviction`, v)
														}
														aria-label={`Conviction for ${option.label}`}
													/>
													<span
														className={css({
															fontFamily: "mono",
															fontSize: "xs",
															flexShrink: "0",
														})}
													>
														{selection.conviction}%
													</span>
												</HStack>
											)}
											<PointsPreview
												kind="option"
												crowdPct={previewCrowdPct(
													option.convictionTotal,
													question.fieldConviction,
													selection.conviction,
												)}
												totalOptions={question.options.length}
												conviction={selection.conviction}
												basePoints={
													basePointsFor({
														shape,
														isOfficial: question.isOfficial,
														isPriced: question.isPriced,
													}) * (question.viewerSeasonPlay?.weight ?? 1)
												}
												lossRate={effectiveLossRate(
													question.lossRate,
													option.lossRate,
												)}
												earlyTier={earlyTier}
												pricing={option}
											/>
										</VStack>
									)
								})}
							</VStack>
						) : (
							<span
								className={css({
									fontFamily: "mono",
									fontSize: "xs",
									color: "fg.subtle",
								})}
							>
								Add picks above first.
							</span>
						)}
						{question.viewerSeasonPlay && (
							<SeasonPlayNote
								play={question.viewerSeasonPlay}
								league={question.league.abbreviation}
							/>
						)}
					</VStack>
				</Card.Body>
			</Card>
			<CaseField callForm={callForm} />
		</VStack>
	)
}
