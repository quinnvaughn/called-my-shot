import { BASE_POINTS_BY_SHAPE } from "@called-my-shot/scoring"
import { useRouteContext } from "@tanstack/react-router"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import {
	type CastCallFormState,
	FORM_ID,
} from "#/components/questions/cast-call-form"
import { isOverUnderShape } from "#/components/questions/cast-call-form/use-cast-call-form"
import { Button } from "#/components/ui/button"
import { FormError } from "#/components/ui/form-error"
import { Modal } from "#/components/ui/modal"
import { useRequireAuth } from "#/hooks/use-require-auth"
import { formatGuess } from "#/lib/field-signal"
import { optionDisplayLabel } from "#/lib/question-labels"
import {
	previewFieldPct,
	previewNumericPoints,
	previewSelectionPoints,
	tierFor,
} from "#/lib/scoring"
import { closeModal } from "#/stores/modal-store"

// The one place conviction, case, and payout are all guaranteed to be seen
// together before anything actually locks in - reads live off the same form
// instance CastCallForm is filling out (rather than a snapshot taken when it
// opened), so it can't show a selection the viewer has since changed.
export function ConfirmCallModal({
	callForm,
}: {
	callForm: CastCallFormState
}) {
	const {
		question,
		shape,
		bucket,
		form,
		convictionMode,
		singleSelectConviction,
		sharedConviction,
		focusCaseText,
		toleranceBand,
		isRateStat,
	} = callForm
	const { me } = useRouteContext({ from: "__root__" })
	const requireAuth = useRequireAuth()

	const selections = form.useWatch("selections")
	const guessValue = form.useWatch("guessValue")
	const caseText = form.useWatch("caseText")
	const numericConviction = form.useWatch("conviction")

	if (!question) return null

	const basePoints = BASE_POINTS_BY_SHAPE[shape]

	// Split mode already shows each pick's own conviction inline below - a
	// single summary number above the list would just be misleading there.
	const showConvictionRow = !(bucket === "multi" && convictionMode === "split")
	const convictionValue =
		bucket === "numeric"
			? (numericConviction ?? 50)
			: bucket === "multi"
				? sharedConviction
				: singleSelectConviction

	const ouLine = question.ouLine
	const isOverUnder = isOverUnderShape(shape)
	function optionLabel(option: { label: string }) {
		return optionDisplayLabel(option.label, isOverUnder, ouLine, isRateStat)
	}

	const trimmedCaseText = caseText.trim()

	return (
		<Modal size="md">
			<Modal.CloseButton />
			<Modal.Title>Confirm your call</Modal.Title>
			<Modal.Description>
				Last look before this locks: no edits after.
			</Modal.Description>

			<VStack gap="2" alignItems="stretch">
				{bucket === "numeric"
					? guessValue !== undefined && (
							<ConfirmPickRow
								name={formatGuess(guessValue, isRateStat)}
								meta={
									toleranceBand !== null
										? `within ±${formatGuess(toleranceBand, isRateStat)} counts as a hit`
										: "counts as a hit within tolerance"
								}
								payout={previewNumericPoints(basePoints, convictionValue)}
							/>
						)
					: selections.map((selection) => {
							const option = question.options.find(
								(o) => o.id === selection.optionId,
							)
							if (!option) return null
							const showConviction =
								bucket === "multi" && convictionMode === "split"
							// Simulated as if this call already went through (see
							// previewFieldPct) so this matches what fieldPct will
							// actually read the instant after Lock It In, not the
							// before-me snapshot the option list was queried with.
							const simulatedFieldPct = previewFieldPct(
								option.callCount,
								question.callCount,
							)
							const meta = `${tierFor(simulatedFieldPct, question.options.length).label} · ${Math.round(simulatedFieldPct)}% of the field${showConviction ? ` · ${selection.conviction}% conviction` : ""}`
							return (
								<ConfirmPickRow
									key={selection.optionId}
									name={optionLabel(option)}
									meta={meta}
									payout={previewSelectionPoints(
										basePoints,
										simulatedFieldPct,
										question.options.length,
										selection.conviction,
									)}
								/>
							)
						})}
			</VStack>

			{showConvictionRow && (
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
						{convictionValue}%
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
							fontFamily: "mono",
							fontSize: "2xs",
							letterSpacing: "wide",
							color: "fg.subtle",
							textTransform: "uppercase",
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
						_hover: { color: "fg.default", borderColor: "border.emphasized" },
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
							form={FORM_ID}
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
													.querySelector<HTMLFormElement>(`#${FORM_ID}`)
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

// Name is always the highest-contrast text in the row - this is the one
// thing being confirmed, everything else here is supporting detail.
function ConfirmPickRow({
	name,
	meta,
	payout,
}: {
	name: string
	meta: string
	payout:
		| { win: number; lose: number }
		| { winLow: number; winHigh: number; lose: number }
		| null
}) {
	return (
		<HStack
			justify="space-between"
			gap="3"
			className={css({
				backgroundColor: "bg.canvas",
				borderRadius: "md",
				paddingBlock: "2.5",
				paddingInline: "3.5",
			})}
		>
			<VStack gap="0.5" alignItems="stretch" className={css({ minWidth: 0 })}>
				<span
					className={css({
						fontSize: "sm",
						fontWeight: "bold",
						color: "fg.default",
						overflow: "hidden",
						textOverflow: "ellipsis",
						whiteSpace: "nowrap",
					})}
				>
					{name}
				</span>
				<span
					className={css({
						fontFamily: "mono",
						fontSize: "2xs",
						color: "fg.subtle",
					})}
				>
					{meta}
				</span>
			</VStack>
			{payout && (
				<span
					className={css({
						flexShrink: "0",
						fontFamily: "mono",
						fontSize: "xs",
						whiteSpace: "nowrap",
					})}
				>
					<span
						className={css({ color: "success.default", fontWeight: "bold" })}
					>
						+
						{"win" in payout
							? payout.win
							: `${payout.winLow}–${payout.winHigh}`}
					</span>
					<span className={css({ color: "fg.subtle" })}> / </span>
					<span
						className={css({ color: "danger.default", fontWeight: "bold" })}
					>
						−{payout.lose}
					</span>
				</span>
			)}
		</HStack>
	)
}
