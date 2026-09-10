import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { match } from "ts-pattern"
import { useTourAnchor } from "#/components/onboarding/tour-anchors"
import type { CastCallFormState } from "#/components/questions/cast-call-form"
import { ConfirmCallModal } from "#/components/questions/confirm-call-modal"
import { Button } from "#/components/ui/button"
import { callersText } from "#/lib/field-signal"
import { openModal } from "#/stores/modal-store"

// A plain `position: sticky` bar - same as the reference mockup's
// `.footer-bar`. This has to be rendered by the route as a direct child of
// the page's own top-level column (a sibling of <CastCallForm>, not nested
// inside it) - sticky only pins within the room its own containing block
// already has, and a form shrink-wrapped to a few short fields has none on
// a short question. The page-level column is tall enough (see
// $questionId.tsx's `minHeight`) for this to actually stick.
export function CallSubmitBar({ callForm }: { callForm: CastCallFormState }) {
	const { question, bucket, form, selections } = callForm

	// No-op unless a first-call walkthrough is running on this page.
	const submitAnchor = useTourAnchor("submit")

	if (!question) return null

	const label = match(bucket)
		.with("numeric", () => "Review your guess")
		.with("multi", () =>
			selections.length === question.picksRequired
				? `Review your ${question.picksRequired} picks`
				: `${selections.length} of ${question.picksRequired} picked`,
		)
		.otherwise(() =>
			selections.length ? "Review your call" : "Select an option first",
		)

	return (
		<form.Subscribe selector={(s) => s.meta.canSubmit}>
			{(canSubmit) => (
				<VStack
					gap="3"
					alignItems="stretch"
					ref={submitAnchor}
					className={css({
						position: "sticky",
						bottom: 0,
						zIndex: 20,
						backgroundColor: "bg.canvas",
						borderTop: "1px solid {colors.border.default}",
						paddingBlock: "4",
					})}
				>
					<HStack
						justify="space-between"
						className={css({
							fontFamily: "mono",
							fontSize: "xs",
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
						onClick={() => openModal(<ConfirmCallModal callForm={callForm} />)}
					>
						{label}
					</Button>
				</VStack>
			)}
		</form.Subscribe>
	)
}
