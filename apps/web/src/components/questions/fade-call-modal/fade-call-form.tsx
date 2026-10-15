import { VStack } from "styled-system/jsx"
import { CaseField } from "#/components/questions/cast-call-form/case-field"
import { CastCallFormProvider } from "#/components/questions/cast-call-form/cast-call-form-context"
import { ConvictionCard } from "#/components/questions/cast-call-form/conviction-card"
import {
	type CastCallFormFragment,
	useCastCallForm,
} from "#/components/questions/cast-call-form/use-cast-call-form"
import { Button } from "#/components/ui/button"
import { FormError } from "#/components/ui/form-error"
import { Modal } from "#/components/ui/modal"
import type { FragmentType } from "#/graphql/generated"
import type { CallSurface } from "#/lib/analytics"
import { Sides } from "./sides"
import type { FadeCallModalProps } from "./types"

type FadeCallFormProps = Pick<
	FadeCallModalProps,
	"callId" | "optionId" | "opUsername" | "opPickLabel" | "pickLabel"
> & {
	question: FragmentType<typeof CastCallFormFragment>
	surface: CallSurface
}

// The NEW fade's form, once its question has loaded.
export function FadeCallForm({
	question,
	surface,
	...props
}: FadeCallFormProps) {
	const callForm = useCastCallForm(question, {
		surface,
		fade: { callId: props.callId, optionId: props.optionId },
	})
	const { form } = callForm

	return (
		<CastCallFormProvider callForm={callForm}>
			<Modal.Description>
				You take the other side. Your call scores like any other, and it's
				listed under @{props.opUsername}'s Doubters.
			</Modal.Description>
			<form onSubmit={form.handleSubmit}>
				<VStack gap="4" alignItems="stretch">
					<Sides {...props} />
					<ConvictionCard />
					<CaseField />
					<form.Subscribe selector={(s) => s.meta}>
						{(meta) => (
							<VStack gap="2" alignItems="stretch">
								<Button
									type="submit"
									variant="solid"
									size="lg"
									fullWidth
									loading={meta.isSubmitting}
									disabled={meta.isSubmitting || !meta.canSubmit}
								>
									Fade @{props.opUsername}
								</Button>
								<FormError message={meta.formError} />
							</VStack>
						)}
					</form.Subscribe>
				</VStack>
			</form>
		</CastCallFormProvider>
	)
}
