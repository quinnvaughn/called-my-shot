import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { useTourAnchor } from "#/components/onboarding/tour-anchors"
import type { CastCallFormState } from "#/components/questions/cast-call-form"
import { CastCallFormProvider } from "#/components/questions/cast-call-form/cast-call-form-context"
import { ConfirmCallModal } from "#/components/questions/confirm-call-modal"
import { Button } from "#/components/ui/button"
import { FormError } from "#/components/ui/form-error"
import { useMe } from "#/hooks/use-me"
import { useRequireAuth } from "#/hooks/use-require-auth"
import { callersText } from "#/lib/field-signal"
import { openModal } from "#/stores/modal-store"
import { CallSubmitSummary } from "./call-submit-summary"

const barClass = css({
	position: "sticky",
	bottom: "var(--bottom-nav-height)",
	zIndex: 20,
	backgroundColor: "bg.canvas",
	borderTop: "1px solid {colors.border.default}",
	paddingTop: "4",
	paddingBottom: "calc({spacing.4} + var(--bottom-safe-area))",
})

// A plain `position: sticky` bar - same as the reference mockup's
// `.footer-bar`. This has to be rendered by the route as a direct child of
// the page's own top-level column (a sibling of <CastCallForm>, not nested
// inside it) - sticky only pins within the room its own containing block
// already has, and a form shrink-wrapped to a few short fields has none on
// a short question. The page-level column is tall enough (see
// $questionId.tsx's `minHeight`) for this to actually stick.
//
// A single pick or a numeric guess locks in from here directly, with the
// call summarized above the button. Several picks at once (a multi-winner
// award, each pick with its own conviction) don't fit on one line, so those
// go through ConfirmCallModal first.
export function CallSubmitBar({ callForm }: { callForm: CastCallFormState }) {
	const { question, bucket, form, selections } = callForm
	const me = useMe()
	const requireAuth = useRequireAuth()

	// No-op unless a first-call walkthrough is running on this page.
	const submitAnchor = useTourAnchor("submit")

	if (!question) return null

	if (bucket === "multi") {
		const label =
			selections.length === question.picksRequired
				? `Review your ${question.picksRequired} picks`
				: `${selections.length} of ${question.picksRequired} picked`
		return (
			<form.Subscribe selector={(s) => s.meta.canSubmit}>
				{(canSubmit) => (
					<VStack gap="3" alignItems="stretch" ref={submitAnchor} className={barClass}>
						<HStack
							justify="space-between"
							className={css({
								textStyle: "metaLg",
								color: "fg.muted",
							})}
						>
							<span>{callersText(question.callCount)}</span>
							<span>bold picks reward more points</span>
						</HStack>
						<Button
							type="button"
							variant="solid"
							size="lg"
							fullWidth
							disabled={!canSubmit}
							onClick={() =>
								openModal(
									<CastCallFormProvider callForm={callForm}>
										<ConfirmCallModal />
									</CastCallFormProvider>,
								)
							}
						>
							{label}
						</Button>
					</VStack>
				)}
			</form.Subscribe>
		)
	}

	const label =
		bucket === "single" && selections.length === 0
			? "Select an option first"
			: "Lock It In"

	return (
		<form.Subscribe selector={(s) => s.meta}>
			{(meta) => (
				<VStack gap="3" alignItems="stretch" ref={submitAnchor} className={barClass}>
					<CallSubmitSummary callForm={callForm} />
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
						{label}
					</Button>
					<FormError message={meta.formError} />
				</VStack>
			)}
		</form.Subscribe>
	)
}
