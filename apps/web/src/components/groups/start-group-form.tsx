import { groupNameSchema } from "@called-my-shot/schemas"
import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import { z } from "zod"
import { Button } from "#/components/ui/button"
import { FormError } from "#/components/ui/form-error"
import { TextInput } from "#/components/ui/text-input"
import { useCreateGroupFlow } from "#/hooks/use-create-group-flow"
import { useMe } from "#/hooks/use-me"
import { useRequireAuth } from "#/hooks/use-require-auth"
import { type StartGroupSurface, track } from "#/lib/analytics"
import { useForm } from "#/lib/form/use-form"
import { showToast } from "#/stores/toast-store"

const startGroupSchema = z.object({ name: groupNameSchema })

type Props = {
	surface: StartGroupSurface
	autoFocus?: boolean
	// The button under the name instead of beside it, for a narrow container
	// like a modal.
	stacked?: boolean
}

// Names a group before there's an account to own it. Submitting opens signup
// with the group's name on it, and the group is created the moment the
// account exists, by the modal's onSuccess for email or by the resumed intent
// for Google. Tracked leagues start as all of them, changeable in Settings.
export function StartGroupForm({ surface, autoFocus, stacked }: Props) {
	const me = useMe()
	const requireAuth = useRequireAuth()
	const { createGroup } = useCreateGroupFlow()

	const form = useForm({
		schema: startGroupSchema,
		defaultValues: { name: "" },
		onSubmit: async ({ name }) => {
			track("group_start_submitted", { surface, signedIn: Boolean(me) })
			requireAuth(
				async () => {
					const result = await createGroup(
						{ name, leagueIds: [] },
						"start_form",
					)
					if (result?.__typename !== "GroupPayload") {
						showToast({
							message: `${name} didn't get created. Try again from New Group.`,
						})
					}
				},
				{
					signup: {
						title: `Create ${name}`,
						description:
							"Sign up and it's ready, with an invite link to send everyone.",
					},
					signin: {
						title: `Sign in to create ${name}`,
						description: "It's ready the moment you're in.",
					},
				},
				{ intent: { kind: "create_group", name }, surface: "start_group" },
			)
		},
	})

	return (
		<form onSubmit={form.handleSubmit} className={css({ width: "full" })}>
			<VStack gap="2" alignItems="stretch">
				<form.Field name="name">
					{(field) => (
						<div
							className={css({
								display: "flex",
								flexDirection: stacked
									? "column"
									: { base: "column", sm: "row" },
								alignItems: stacked
									? "stretch"
									: { base: "stretch", sm: "flex-end" },
								gap: "3",
							})}
						>
							<TextInput
								className={css({ flex: 1 })}
								error={field.meta.error ?? undefined}
							>
								<TextInput.Label>Name your group</TextInput.Label>
								<TextInput.Group>
									<TextInput.Field
										placeholder="e.g. Sunday Scaries"
										type="text"
										autoFocus={autoFocus}
										value={field.value}
										onChange={field.onChange}
										onBlur={field.onBlur}
									/>
								</TextInput.Group>
							</TextInput>
							<form.Subscribe selector={(s) => s.meta}>
								{(meta) => (
									<Button
										type="submit"
										variant="solid"
										size="lg"
										loading={meta.isSubmitting}
										disabled={meta.isSubmitting || !meta.canSubmit}
									>
										Start a group
									</Button>
								)}
							</form.Subscribe>
						</div>
					)}
				</form.Field>
				<form.Subscribe selector={(s) => s.meta}>
					{(meta) => <FormError message={meta.formError} />}
				</form.Subscribe>
			</VStack>
		</form>
	)
}
