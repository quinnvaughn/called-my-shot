import {
	GROUP_PINS_MAX,
	GROUP_WELCOME_MESSAGE_MAX,
	groupWelcomeMessageSchema,
} from "@called-my-shot/schemas"
import { useQueryClient } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { useState } from "react"
import { FiChevronDown, FiChevronUp, FiX } from "react-icons/fi"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { match } from "ts-pattern"
import { z } from "zod"
import { Button } from "#/components/ui/button"
import { Card } from "#/components/ui/card"
import { FieldHint } from "#/components/ui/field-hint"
import { FieldLabel } from "#/components/ui/field-label"
import { FormError } from "#/components/ui/form-error"
import { SaveNote } from "#/components/ui/save-note"
import { Textarea } from "#/components/ui/textarea"
import { type FragmentType, graphql, useFragment } from "#/graphql/generated"
import { useGqlMutation } from "#/graphql/hooks"
import { UpdateGroupWelcomeDocument } from "#/graphql/mutations/groups"
import { useForm } from "#/lib/form/use-form"
import { pluralize } from "#/lib/pluralize"
import { buildQuestionSlug } from "#/lib/slug"
import { useGroupPinActions } from "./use-group-pin-actions"

export const GroupWelcomeSectionPinFragment = graphql(`
	fragment GroupWelcomeSection_pin on GroupPin {
		id
		memberCallCount
		question {
			id
			title
		}
	}
`)

type Props = {
	groupId: string
	welcomeMessage: string | null
	pins: FragmentType<typeof GroupWelcomeSectionPinFragment>[]
}

const formSchema = z.object({ welcomeMessage: groupWelcomeMessageSchema })

const rowButton = css({
	display: "flex",
	alignItems: "center",
	justifyContent: "center",
	width: "8",
	height: "8",
	flexShrink: 0,
	borderRadius: "lg",
	color: "fg.subtle",
	cursor: "pointer",
	_hover: { color: "fg.default", bg: "bg.subtle" },
	_disabled: { opacity: 0.35, cursor: "default", _hover: { bg: "none" } },
})

// Admins only, like the rest of the group's own settings. What a new member
// sees in the welcome modal: the message, and the pins it asks them to call
// first. Pins save as soon as they're moved or removed.
export function GroupWelcomeSection({ groupId, welcomeMessage, pins }: Props) {
	return (
		<VStack alignItems="stretch" gap="3">
			<WelcomeMessageCard groupId={groupId} welcomeMessage={welcomeMessage} />
			<PinsCard groupId={groupId} pins={pins} />
		</VStack>
	)
}

function WelcomeMessageCard({
	groupId,
	welcomeMessage,
}: Pick<Props, "groupId" | "welcomeMessage">) {
	const updateWelcome = useGqlMutation(UpdateGroupWelcomeDocument)
	const queryClient = useQueryClient()
	const [savedNote, setSavedNote] = useState<string | null>(null)

	const form = useForm({
		defaultValues: { welcomeMessage: welcomeMessage ?? "" },
		schema: formSchema,
		onSubmit: async (values, helpers) => {
			const data = await updateWelcome.mutateAsync({
				// Always sent, even blank - a blank message is how an admin
				// clears it.
				input: { groupId, welcomeMessage: values.welcomeMessage },
			})
			const result = data?.updateGroupWelcome

			if (!result) {
				helpers.setFormError("Something went wrong. Try again.")
				return
			}

			await match(result)
				.with({ __typename: "ValidationError" }, async (r) => {
					const errors: Record<string, string | null> = {}
					for (const fieldError of r.fieldErrors ?? []) {
						if (fieldError.field) errors[fieldError.field] = fieldError.message
						else helpers.setFormError(fieldError.message)
					}
					helpers.setErrors(errors)
				})
				.with(
					{ __typename: "AuthenticationError" },
					{ __typename: "AuthorizationError" },
					{ __typename: "NotFoundError" },
					async (r) => {
						helpers.setFormError(r.message)
					},
				)
				.with({ __typename: "GroupPayload" }, async (r) => {
					helpers.reset({ welcomeMessage: r.group.welcomeMessage ?? "" })
					await queryClient.invalidateQueries({ queryKey: ["GroupSettings"] })
					setSavedNote("Saved")
					setTimeout(() => setSavedNote(null), 2000)
				})
				.exhaustive()
		},
	})

	return (
		<Card>
			<Card.Body>
				<form onSubmit={form.handleSubmit} id="group-welcome-form">
					<form.Field name="welcomeMessage">
						{(field) => (
							<Textarea
								error={field.meta.error ?? undefined}
								description="Shown to each new member the first time they open the group, above the question they're asked to call."
							>
								<Textarea.Label>Welcome message</Textarea.Label>
								<Textarea.Field
									placeholder="e.g. Season picks are pinned. Lowest score buys wings."
									maxLength={GROUP_WELCOME_MESSAGE_MAX}
									rows={3}
									value={field.value}
									onChange={field.onChange}
									onBlur={field.onBlur}
								/>
								<Textarea.CharCount
									value={field.value ?? ""}
									max={GROUP_WELCOME_MESSAGE_MAX}
								/>
							</Textarea>
						)}
					</form.Field>
				</form>
			</Card.Body>
			<Card.Footer>
				<form.Subscribe selector={(s) => s.meta}>
					{(meta) => (
						<HStack justify="flex-end" alignItems="center" gap="3" width="full">
							<SaveNote>{savedNote}</SaveNote>
							<FormError message={meta.formError} />
							<Button
								type="submit"
								form="group-welcome-form"
								variant="solid"
								size="sm"
								loading={meta.isSubmitting}
								disabled={meta.isSubmitting || !meta.canSubmit}
							>
								Save
							</Button>
						</HStack>
					)}
				</form.Subscribe>
			</Card.Footer>
		</Card>
	)
}

function PinsCard({
	groupId,
	pins: pinsProp,
}: Pick<Props, "groupId" | "pins">) {
	const pins = useFragment(GroupWelcomeSectionPinFragment, pinsProp)
	const { move, unpin, pending, error } = useGroupPinActions(groupId)
	const ids = pins.map((pin) => pin.id)

	return (
		<Card>
			<Card.Body>
				<VStack gap="3" alignItems="stretch">
					<FieldLabel>
						Pinned questions · {pins.length}/{GROUP_PINS_MAX}
					</FieldLabel>
					<FieldHint>
						Pin up to {GROUP_PINS_MAX} open questions from a question's Share
						menu. New members are asked to call the first one, and a pin drops
						off when its question locks.
					</FieldHint>
					{pins.length === 0 ? (
						<span
							className={css({
								fontFamily: "mono",
								fontSize: "xs",
								color: "fg.subtle",
							})}
						>
							Nothing pinned. New members are offered the open question most
							called in the group.
						</span>
					) : (
						<VStack gap="0" alignItems="stretch">
							{pins.map((pin, index) => (
								<HStack
									key={pin.id}
									gap="1"
									className={css({
										paddingBlock: "2",
										borderBottom: "1px solid {colors.border.default}",
										_last: { borderBottom: "none" },
									})}
								>
									<VStack
										gap="0.5"
										alignItems="flex-start"
										className={css({ flex: "1", minWidth: "0" })}
									>
										<Link
											to="/questions/$questionId/{-$slug}"
											params={{
												questionId: pin.question.id,
												slug: buildQuestionSlug(pin.question.title),
											}}
											className={css({
												fontSize: "sm",
												overflow: "hidden",
												textOverflow: "ellipsis",
												whiteSpace: "nowrap",
												maxWidth: "full",
												_hover: { textDecoration: "underline" },
											})}
										>
											{pin.question.title}
										</Link>
										<span
											className={css({
												fontFamily: "mono",
												fontSize: "2xs",
												color: "fg.subtle",
											})}
										>
											{pin.memberCallCount}{" "}
											{pluralize(pin.memberCallCount, "member")} called
										</span>
									</VStack>
									<button
										type="button"
										className={rowButton}
										aria-label="Move up"
										disabled={pending || index === 0}
										onClick={() => move(ids, index, index - 1)}
									>
										<FiChevronUp size={16} />
									</button>
									<button
										type="button"
										className={rowButton}
										aria-label="Move down"
										disabled={pending || index === pins.length - 1}
										onClick={() => move(ids, index, index + 1)}
									>
										<FiChevronDown size={16} />
									</button>
									<button
										type="button"
										className={rowButton}
										aria-label="Unpin"
										disabled={pending}
										onClick={() => unpin(pin.id)}
									>
										<FiX size={16} />
									</button>
								</HStack>
							))}
						</VStack>
					)}
					<FormError message={error} />
				</VStack>
			</Card.Body>
		</Card>
	)
}
