import { createGroupSchema } from "@called-my-shot/schemas"
import { useQueryClient } from "@tanstack/react-query"
import { useNavigate, useRouter } from "@tanstack/react-router"
import { VStack } from "styled-system/jsx"
import { match } from "ts-pattern"
import { CreateGroupDocument } from "#/graphql/generated/graphql"
import { useGqlMutation } from "#/graphql/hooks"
import { track } from "#/lib/analytics"
import { useForm } from "#/lib/form/use-form"
import { closeModal } from "#/stores/modal-store"
import { Button } from "../ui/button"
import { FormError } from "../ui/form-error"
import { Modal } from "../ui/modal"
import { TextInput } from "../ui/text-input"

type CreatedGroup = {
	id: string
	name: string
	myInvite: { id: string; code: string; expiresAt?: string | null }
}

type Props = {
	// Replaces the default "navigate to the new group and close" behavior.
	// Onboarding uses it to hand straight into the invite modal instead, since
	// a group with nobody in it is not much use and the link is what fixes
	// that. A callback rather than a mode flag so this file stays unaware of
	// who is calling it.
	onCreated?: (group: CreatedGroup) => void
}

export function NewGroupModal({ onCreated }: Props = {}) {
	const createGroup = useGqlMutation(CreateGroupDocument)
	const router = useRouter()
	const queryClient = useQueryClient()
	const navigate = useNavigate()

	const form = useForm({
		defaultValues: {
			name: "",
		},
		schema: createGroupSchema,
		onSubmit: async (values, helpers) => {
			const data = await createGroup.mutateAsync({ input: values })
			const result = data?.createGroup

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
				.with({ __typename: "AuthenticationError" }, async () => {
					helpers.setFormError("You need to sign in to create a group.")
				})
				.with({ __typename: "GroupPayload" }, async (r) => {
					track("group_created", {
						groupId: r.group.id,
						surface: onCreated ? "onboarding" : "groups_page",
					})
					await queryClient.invalidateQueries()
					await router.invalidate()
					if (onCreated) {
						onCreated(r.group)
						return
					}
					await navigate({
						to: "/groups/$groupId",
						params: { groupId: r.group.id },
					})
					closeModal()
				})
				.exhaustive()
		},
	})
	return (
		<Modal>
			<Modal.CloseButton />
			<VStack gap="1" alignItems="flex-start">
				<Modal.Title>Create a group</Modal.Title>
				<Modal.Description>
					Invite friends by link and compare real points against people you
					actually know.
				</Modal.Description>
			</VStack>
			<form onSubmit={form.handleSubmit}>
				<VStack gap="3.5" alignItems="stretch">
					<form.Field name="name">
						{(field) => (
							<TextInput error={field.meta.error ?? undefined}>
								<TextInput.Label>Group name</TextInput.Label>
								<TextInput.Group>
									<TextInput.Field
										placeholder="e.g. Wolfpack"
										type="text"
										value={field.value}
										onChange={field.onChange}
										onBlur={field.onBlur}
									/>
								</TextInput.Group>
							</TextInput>
						)}
					</form.Field>
					<form.Subscribe selector={(s) => s.meta}>
						{(meta) => (
							<VStack gap="3.5" alignItems="stretch">
								<Button
									type="submit"
									variant="solid"
									size="md"
									fullWidth
									loading={meta.isSubmitting}
									disabled={meta.isSubmitting || !meta.canSubmit}
								>
									Create Group
								</Button>
								<FormError message={meta.formError} />
							</VStack>
						)}
					</form.Subscribe>
				</VStack>
			</form>
		</Modal>
	)
}
