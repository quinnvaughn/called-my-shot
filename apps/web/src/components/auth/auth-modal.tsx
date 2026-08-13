import { useMutation } from "@apollo/client/react"
import { signInSchema, signUpSchema } from "@called-my-shot/schemas"
import { useNavigate, useRouter } from "@tanstack/react-router"
import { useState } from "react"
import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import { match } from "ts-pattern"
import { Button } from "#/components/ui/button"
import { Modal } from "#/components/ui/modal"
import { Tabs } from "#/components/ui/tabs"
import { TextInput } from "#/components/ui/text-input"
import { SignInDocument, SignUpDocument } from "#/graphql/mutations/auth"
import { useForm } from "#/lib/form/use-form"
import { closeModal } from "#/stores/modal-store"
import { Brand } from "../ui/brand"
import { FormError } from "../ui/form-error"

export type AuthModalView = "signin" | "signup"

type AuthModalCopyEntry = {
	title: string
	description: string
}

export type AuthModalCopy = Record<AuthModalView, AuthModalCopyEntry>

export type AuthModalCopyOverride = Partial<
	Record<AuthModalView, Partial<AuthModalCopyEntry>>
>

type AuthModalProps = {
	defaultView?: AuthModalView
	// Lets callers override the title/description per view - e.g. gating
	// "join a group" behind auth should explain *why* auth is required
	// instead of showing the generic copy.
	copy?: AuthModalCopyOverride
	// Runs instead of the default "/home" redirect once sign-in/sign-up
	// succeeds - lets callers (e.g. useRequireAuth) resume whatever action
	// was gated behind auth.
	onSuccess?: () => void
}

const defaultCopy: AuthModalCopy = {
	signin: {
		title: "Welcome back",
		description: "Sign in to make your calls.",
	},
	signup: {
		title: "Make your first call",
		description: "Free to play. Takes about 30 seconds.",
	},
}

export function AuthModal({
	defaultView = "signin",
	copy,
	onSuccess,
}: AuthModalProps) {
	const [view, setView] = useState<AuthModalView>(defaultView)

	const { title, description } = {
		...defaultCopy[view],
		...copy?.[view],
	}

	return (
		<Modal>
			<Modal.CloseButton />
			<Brand size="sm" />
			<Tabs value={view} onValueChange={setView}>
				<Tabs.List stretch>
					<Tabs.Trigger value="signin">Sign in</Tabs.Trigger>
					<Tabs.Trigger value="signup">Create account</Tabs.Trigger>
				</Tabs.List>
			</Tabs>
			<VStack gap="1" alignItems="flex-start">
				<Modal.Title>{title}</Modal.Title>
				<Modal.Description>{description}</Modal.Description>
			</VStack>
			{view === "signin" ? (
				<SignInFields onSuccess={onSuccess} />
			) : (
				<SignUpFields onSuccess={onSuccess} />
			)}
		</Modal>
	)
}

function SignInFields({ onSuccess }: { onSuccess?: () => void }) {
	const [signIn] = useMutation(SignInDocument)
	const router = useRouter()
	const navigate = useNavigate()

	const form = useForm({
		schema: signInSchema,
		defaultValues: { identifier: "", password: "" },
		onSubmit: async (values, helpers) => {
			const { data } = await signIn({ variables: { input: values } })
			const result = data?.signIn

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
				.with({ __typename: "AuthPayload" }, async () => {
					await router.invalidate()
					closeModal()
					if (onSuccess) onSuccess()
					else await navigate({ to: "/home" })
				})
				.exhaustive()
		},
	})

	return (
		<form onSubmit={form.handleSubmit}>
			<VStack gap="5" alignItems="stretch">
				<VStack gap="3.5" alignItems="stretch">
					<form.Field name="identifier">
						{(field) => (
							<TextInput error={field.meta.error ?? undefined}>
								<TextInput.Label>Email or username</TextInput.Label>
								<TextInput.Group>
									<TextInput.Field
										type="text"
										autoCapitalize="off"
										placeholder="you@email.com or @username"
										autoComplete="username"
										value={field.value}
										onChange={field.onChange}
										onBlur={field.onBlur}
									/>
								</TextInput.Group>
							</TextInput>
						)}
					</form.Field>
					<form.Field name="password">
						{(field) => (
							<TextInput error={field.meta.error ?? undefined}>
								<TextInput.Label>Password</TextInput.Label>
								<TextInput.Password
									placeholder="At least 8 characters"
									autoComplete="current-password"
									value={field.value}
									onChange={field.onChange}
									onBlur={field.onBlur}
								/>
							</TextInput>
						)}
					</form.Field>
				</VStack>
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
								Sign in
							</Button>
							<FormError message={meta.formError} />
						</VStack>
					)}
				</form.Subscribe>
			</VStack>
		</form>
	)
}

function SignUpFields({ onSuccess }: { onSuccess?: () => void }) {
	const [signUp] = useMutation(SignUpDocument)
	const router = useRouter()
	const navigate = useNavigate()

	const form = useForm({
		schema: signUpSchema,
		defaultValues: { name: "", username: "", email: "", password: "" },
		onSubmit: async (values, helpers) => {
			const { data } = await signUp({ variables: { input: values } })
			const result = data?.signUp

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
				.with({ __typename: "AuthPayload" }, async () => {
					await router.invalidate()
					closeModal()
					if (onSuccess) onSuccess()
					else await navigate({ to: "/home" })
				})
				.exhaustive()
		},
	})

	return (
		<form onSubmit={form.handleSubmit}>
			<VStack gap="5" alignItems="stretch">
				<VStack gap="3.5" alignItems="stretch">
					<form.Field name="name">
						{(field) => (
							<TextInput error={field.meta.error ?? undefined}>
								<TextInput.Label>Name</TextInput.Label>
								<TextInput.Group>
									<TextInput.Field
										type="text"
										placeholder="Full name"
										autoComplete="name"
										value={field.value}
										onChange={field.onChange}
										onBlur={field.onBlur}
									/>
								</TextInput.Group>
							</TextInput>
						)}
					</form.Field>
					<form.Field name="username">
						{(field) => (
							<TextInput error={field.meta.error ?? undefined}>
								<TextInput.Label>Username</TextInput.Label>
								<TextInput.Group>
									<TextInput.Field
										type="text"
										placeholder="@yourusername"
										autoComplete="username"
										value={field.value}
										onChange={field.onChange}
										onBlur={field.onBlur}
									/>
								</TextInput.Group>
							</TextInput>
						)}
					</form.Field>
					<form.Field name="email">
						{(field) => (
							<TextInput error={field.meta.error ?? undefined}>
								<TextInput.Label>Email</TextInput.Label>
								<TextInput.Group>
									<TextInput.Field
										type="email"
										placeholder="you@email.com"
										autoComplete="email"
										value={field.value}
										onChange={field.onChange}
										onBlur={field.onBlur}
									/>
								</TextInput.Group>
							</TextInput>
						)}
					</form.Field>
					<form.Field name="password">
						{(field) => (
							<TextInput error={field.meta.error ?? undefined}>
								<TextInput.Label>Password</TextInput.Label>
								<TextInput.Password
									placeholder="At least 8 characters"
									autoComplete="new-password"
									value={field.value}
									onChange={field.onChange}
									onBlur={field.onBlur}
								/>
							</TextInput>
						)}
					</form.Field>
				</VStack>
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
								Create account
							</Button>
							<FormError message={meta.formError} />
							<p
								className={css({
									fontFamily: "mono",
									fontSize: "3xs",
									color: "fg.subtle",
									textAlign: "center",
								})}
							>
								No money, ever. Points are pure reputation.
							</p>
						</VStack>
					)}
				</form.Subscribe>
			</VStack>
		</form>
	)
}
