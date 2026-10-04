import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { match } from "ts-pattern"
import { CaseField } from "#/components/questions/cast-call-form/case-field"
import { ConvictionCard } from "#/components/questions/cast-call-form/conviction-card"
import {
	type CalledPick,
	type CastCallFormFragment,
	useCastCallForm,
} from "#/components/questions/cast-call-form/use-cast-call-form"
import { Button } from "#/components/ui/button"
import { FormError } from "#/components/ui/form-error"
import { Modal } from "#/components/ui/modal"
import { type FragmentType, graphql } from "#/graphql/generated"
import { useGqlMutation } from "#/graphql/hooks"
import { AttachFadeDocument } from "#/graphql/mutations/calls"
import { CallRecordDocument } from "#/graphql/queries/call"
import { gqlQueryKey, gqlQueryOptions } from "#/graphql/query-options"
import type { CallSurface } from "#/lib/analytics"
import { closeModal } from "#/stores/modal-store"

// The call page doesn't carry the cast form's question fields, and most
// visitors never fade, so they're fetched when the modal opens.
const FadeCallQuestionDocument = graphql(`
	query FadeCallQuestion($id: ID!) {
		question(id: $id) {
			id
			...CastCallForm_question
		}
	}
`)

export type FadeCallModalProps = {
	callId: string
	questionId: string
	opUsername: string
	// Both formatted the way the call page states a pick.
	opPickLabel: string
	pickLabel: string
	optionId: string
	mode: "NEW" | "ATTACH"
}

const sideLabelClass = css({
	fontFamily: "mono",
	fontSize: "2xs",
	letterSpacing: "wide",
	textTransform: "uppercase",
	color: "fg.subtle",
})

// A fade from the call page. NEW casts a call on the other side with the pick
// fixed; ATTACH aims a call the viewer already has on the other side.
export function FadeCallModal(props: FadeCallModalProps) {
	return (
		<Modal size="md">
			<Modal.CloseButton />
			<Modal.Title>Fade @{props.opUsername}</Modal.Title>
			{match(props.mode)
				.with("NEW", () => <NewFade {...props} />)
				.with("ATTACH", () => <AttachFade {...props} />)
				.exhaustive()}
		</Modal>
	)
}

// The two sides, OP's struck through, so the fixed pick is visible before
// anything is set.
function Sides({
	opUsername,
	opPickLabel,
	pickLabel,
}: Pick<FadeCallModalProps, "opUsername" | "opPickLabel" | "pickLabel">) {
	return (
		<VStack
			gap="2"
			alignItems="stretch"
			className={css({
				backgroundColor: "bg.canvas",
				borderRadius: "md",
				paddingBlock: "2.5",
				paddingInline: "3.5",
			})}
		>
			<HStack justify="space-between" gap="3">
				<span className={sideLabelClass}>@{opUsername}'s pick</span>
				<span
					className={css({
						fontSize: "sm",
						color: "fg.subtle",
						textDecoration: "line-through",
					})}
				>
					{opPickLabel}
				</span>
			</HStack>
			<HStack justify="space-between" gap="3">
				<span className={sideLabelClass}>Your side</span>
				<span className={css({ fontSize: "sm", fontWeight: "bold" })}>
					{pickLabel}
				</span>
			</HStack>
		</VStack>
	)
}

function NewFade(props: FadeCallModalProps) {
	const { data, isPending } = useQuery(
		gqlQueryOptions(
			FadeCallQuestionDocument,
			{ id: props.questionId },
			{ abortable: false },
		),
	)

	if (isPending) {
		return (
			<p className={css({ fontSize: "sm", color: "fg.subtle" })}>Loading…</p>
		)
	}
	if (!data?.question) {
		return <FormError message="This question couldn't be loaded." />
	}
	return (
		<FadeCallForm {...props} question={data.question} surface="call_page" />
	)
}

export type FadeCallFormProps = Pick<
	FadeCallModalProps,
	"callId" | "optionId" | "opUsername" | "opPickLabel" | "pickLabel"
> & {
	question: FragmentType<typeof CastCallFormFragment>
	surface: CallSurface
	welcomeGroupId?: string
	closeOnSuccess?: boolean
	onCalled?: (pick: CalledPick) => void
}

// The NEW fade's form on its own, so a surface that already has the question
// loaded (the group welcome modal) can show it in place rather than stacking
// a second modal over itself.
export function FadeCallForm({
	question,
	surface,
	welcomeGroupId,
	closeOnSuccess,
	onCalled,
	...props
}: FadeCallFormProps) {
	const callForm = useCastCallForm(question, {
		surface,
		fade: { callId: props.callId, optionId: props.optionId },
		welcomeGroupId,
		closeOnSuccess,
		onCalled,
	})
	const { form } = callForm

	return (
		<>
			<Modal.Description>
				You take the other side. Your call scores like any other, and it's
				listed under @{props.opUsername}'s Doubters.
			</Modal.Description>
			<form onSubmit={form.handleSubmit}>
				<VStack gap="4" alignItems="stretch">
					<Sides {...props} />
					<ConvictionCard callForm={callForm} />
					<CaseField callForm={callForm} />
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
		</>
	)
}

function AttachFade(props: FadeCallModalProps) {
	const attach = useGqlMutation(AttachFadeDocument)
	const queryClient = useQueryClient()
	const [error, setError] = useState<string | null>(null)

	async function onConfirm() {
		setError(null)
		const result = (
			await attach.mutateAsync({ input: { targetCallId: props.callId } })
		)?.attachFade
		if (!result) {
			setError("Something went wrong. Try again.")
			return
		}
		await match(result)
			.with({ __typename: "AttachFadePayload" }, async () => {
				closeModal()
				await queryClient.invalidateQueries({
					queryKey: gqlQueryKey(CallRecordDocument, { id: props.callId }),
				})
			})
			.with({ __typename: "ValidationError" }, async (r) => {
				setError(r.fieldErrors?.[0]?.message ?? "Couldn't fade this call.")
			})
			.with(
				{ __typename: "AuthenticationError" },
				{ __typename: "NotFoundError" },
				async (r) => {
					setError(r.message)
				},
			)
			.exhaustive()
	}

	return (
		<>
			<Modal.Description>
				Your call is already on the other side. Aim it at @{props.opUsername}
				and it's listed under their Doubters. Your pick and conviction stay as
				they are.
			</Modal.Description>
			<VStack gap="4" alignItems="stretch">
				<Sides {...props} />
				<VStack gap="2" alignItems="stretch">
					<Button
						variant="solid"
						size="lg"
						fullWidth
						loading={attach.isPending}
						onClick={onConfirm}
					>
						Fade @{props.opUsername}
					</Button>
					<FormError message={error} />
				</VStack>
			</VStack>
		</>
	)
}
