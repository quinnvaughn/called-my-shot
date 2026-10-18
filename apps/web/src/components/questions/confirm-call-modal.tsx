import {
	basePointsFor,
	effectiveLossRate,
	isSeasonLongShape,
	seasonEarlyTierFor,
} from "@called-my-shot/scoring"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { useCastCallFormContext } from "#/components/questions/cast-call-form/cast-call-form-context"
import { ConfirmPickRow } from "#/components/questions/confirm-pick-row"
import { Button } from "#/components/ui/button"
import { FormError } from "#/components/ui/form-error"
import { Modal } from "#/components/ui/modal"
import { useMe } from "#/hooks/use-me"
import { useRequireAuth } from "#/hooks/use-require-auth"
import {
	crowdTierFor,
	pickMeta,
	previewCrowdPct,
	previewSelectionPoints,
} from "#/lib/scoring"
import { closeModal } from "#/stores/modal-store"

// The last look before a multi-pick call (a multi-winner award) locks in:
// every pick with its own payout, conviction, and the case, together. A
// single pick or a numeric guess fits on CallSubmitBar's one line and locks
// in from there instead. Reads live off the same form instance CastCallForm
// is filling out (rather than a snapshot taken when it opened), so it can't
// show a selection the viewer has since changed.
export function ConfirmCallModal() {
	const callForm = useCastCallFormContext()
	const { question, shape, form, convictionMode, sharedConviction, focusCaseText } =
		callForm
	const me = useMe()
	const requireAuth = useRequireAuth()

	const selections = form.useWatch("selections")
	const caseText = form.useWatch("caseText")

	if (!question) return null

	// A season-long call at the viewer's pace so far - see SeasonPlay - and a
	// series call at how far into the series it is - see SeriesStage.
	const basePoints =
		basePointsFor({
			shape,
			isOfficial: question.isOfficial,
			isPriced: question.isPriced,
		}) *
		(question.viewerSeasonPlay?.weight ?? 1) *
		(question.seriesStage?.weight ?? 1)
	const { lossRate } = question
	// Season-long shapes preview off games played so far, not rank - see
	// PointsPreview's own comment on the same distinction. Null for a
	// season-long one with no games synced yet, where seasonEarlyTierFor's own
	// zero-games guard lands on the same preseason ceiling either way.
	const earlyTier =
		isSeasonLongShape(shape) &&
		question.seasonGamesPlayed !== null &&
		question.seasonTotalGames !== null
			? seasonEarlyTierFor(
					question.seasonGamesPlayed,
					question.seasonTotalGames,
				)
			: undefined

	// Split mode already shows each pick's own conviction inline below - a
	// single summary number above the list would just be misleading there.
	const isSplit = convictionMode === "split"

	const trimmedCaseText = caseText.trim()

	return (
		<Modal size="md">
			<Modal.CloseButton />
			<Modal.Title>Confirm your call</Modal.Title>
			<Modal.Description>
				Last look before this locks: no edits after.
			</Modal.Description>

			<VStack gap="2" alignItems="stretch">
				{selections.map((selection) => {
							const option = question.options.find(
								(o) => o.id === selection.optionId,
							)
							if (!option) return null
							// Simulated as if this call already went through (see
							// previewCrowdPct) so this matches what the field's
							// share will actually read the instant after Lock It
							// In, not the before-me snapshot the option list was
							// queried with.
							const simulatedCrowdPct = previewCrowdPct(
								option.convictionTotal,
								question.fieldConviction,
								selection.conviction,
							)
							const meta = [
								...pickMeta(
									crowdTierFor(
										simulatedCrowdPct,
										question.options.length,
										option,
									),
									simulatedCrowdPct,
									effectiveLossRate(lossRate, option.lossRate),
									option,
								),
								...(isSplit ? [`${selection.conviction}% conviction`] : []),
							].join(" · ")
							return (
								<ConfirmPickRow
									key={selection.optionId}
									name={option.label}
									subject={option}
									meta={meta}
									payout={previewSelectionPoints(
										basePoints,
										effectiveLossRate(lossRate, option.lossRate),
										simulatedCrowdPct,
										question.options.length,
										selection.conviction,
										earlyTier,
										option,
									)}
								/>
							)
						})}
			</VStack>

			{!isSplit && (
				<HStack
					justify="space-between"
					className={css({
						fontFamily: "mono",
						fontSize: "xs",
						letterSpacing: "wide",
						color: "fg.subtle",
						paddingInline: "0.5",
					})}
				>
					<span>CONVICTION</span>
					<span className={css({ color: "fg.default", fontWeight: "bold" })}>
						{sharedConviction}%
					</span>
				</HStack>
			)}

			{trimmedCaseText ? (
				<VStack
					gap="1"
					alignItems="stretch"
					className={css({
						backgroundColor: "bg.subtle",
						borderLeft: "2px solid {colors.border.default}",
						borderRadius: "0 {radii.md} {radii.md} 0",
						paddingBlock: "2.5",
						paddingInline: "3",
					})}
				>
					<span
						className={css({
							textStyle: "label",
							color: "fg.subtle",
						})}
					>
						Your case
					</span>
					<span
						className={css({
							fontSize: "xs",
							color: "fg.body",
							lineHeight: "relaxed",
						})}
					>
						{caseText}
					</span>
				</VStack>
			) : (
				<button
					type="button"
					onClick={() => {
						closeModal()
						focusCaseText()
					}}
					className={css({
						textAlign: "center",
						fontFamily: "mono",
						fontSize: "xs",
						letterSpacing: "wide",
						color: "fg.subtle",
						border: "1px dashed {colors.border.default}",
						borderRadius: "md",
						paddingBlock: "2.5",
						cursor: "pointer",
						_hover: {
							color: "fg.default",
							border: "1px dashed {colors.border.emphasized}",
						},
					})}
				>
					+ add a case before locking in
				</button>
			)}

			<form.Subscribe selector={(s) => s.meta}>
				{(meta) => (
					<VStack gap="2" alignItems="stretch">
						<Button
							type={me ? "submit" : "button"}
							form={callForm.formId}
							variant="solid"
							size="lg"
							fullWidth
							loading={meta.isSubmitting}
							disabled={meta.isSubmitting || !meta.canSubmit}
							onClick={
								me
									? undefined
									: () =>
											requireAuth(() => {
												document
													.querySelector<HTMLFormElement>(`#${callForm.formId}`)
													?.requestSubmit()
											})
							}
						>
							Lock It In
						</Button>
						<button
							type="button"
							onClick={closeModal}
							className={css({
								textAlign: "center",
								fontFamily: "mono",
								fontSize: "xs",
								letterSpacing: "wide",
								color: "fg.subtle",
								paddingBlock: "1.5",
								cursor: "pointer",
								_hover: { color: "fg.default" },
							})}
						>
							Go back &amp; edit
						</button>
						<FormError message={meta.formError} />
					</VStack>
				)}
			</form.Subscribe>
		</Modal>
	)
}
