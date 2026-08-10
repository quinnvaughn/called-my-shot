import { useMutation } from "@apollo/client/react"
import { signInSchema, signUpSchema } from "@called-my-shot/schemas"
import { useState } from "react"
import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import { Button } from "#/components/ui/button"
import { Modal } from "#/components/ui/modal"
import { Tabs } from "#/components/ui/tabs"
import { TextInput } from "#/components/ui/text-input"
import { SignInDocument, SignUpDocument } from "#/graphql/mutations/auth"
import { useForm } from "#/lib/form/use-form"
import { closeModal } from "#/stores/modal-store"
import { Brand } from "../ui/brand"

export type AuthModalView = "signin" | "signup"

type AuthModalProps = {
	defaultView?: AuthModalView
}

const copy = {
	signin: {
		title: "Welcome back",
		description: "Sign in to make your calls.",
	},
	signup: {
		title: "Make your first call",
		description: "Free to play. Takes about 30 seconds.",
	},
} as const

// Passed directly to openModal(<AuthModal />) — owns its own tab state since
// nothing outside the modal ever needs to know which view is active.
export function AuthModal({ defaultView = "signin" }: AuthModalProps) {
	const [view, setView] = useState<AuthModalView>(defaultView)

	return (
		<Modal>
			<Modal.CloseButton />
			<Brand size="sm" />
			<Tabs value={view} onValueChange={setView}>
				<Tabs.List>
					<Tabs.Trigger value="signin">Sign in</Tabs.Trigger>
					<Tabs.Trigger value="signup">Create account</Tabs.Trigger>
				</Tabs.List>
			</Tabs>
			<VStack gap="1" alignItems="flex-start">
				<Modal.Title>{copy[view].title}</Modal.Title>
				<Modal.Description>{copy[view].description}</Modal.Description>
			</VStack>

			{view === "signin" ? <SignInFields /> : <SignUpFields />}
		</Modal>
	)
}

function FormError({ message }: { message: string | null }) {
	if (!message) return null
	return (
		<p
			role="alert"
			className={css({
				fontSize: "xs",
				color: "danger.default",
				textAlign: "center",
			})}
		>
			{message}
		</p>
	)
}

function SignInFields() {
	const [signIn] = useMutation(SignInDocument)

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

			if (result.__typename === "AuthError") {
				const errors: Record<string, string | null> = {}
				for (const fieldError of result.fieldErrors ?? []) {
					if (fieldError.field) errors[fieldError.field] = fieldError.message
					else helpers.setFormError(fieldError.message)
				}
				helpers.setErrors(errors)
				return
			}

			closeModal()
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

function SignUpFields() {
	const [signUp] = useMutation(SignUpDocument)

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

			if (result.__typename === "AuthError") {
				const errors: Record<string, string | null> = {}
				for (const fieldError of result.fieldErrors ?? []) {
					if (fieldError.field) errors[fieldError.field] = fieldError.message
					else helpers.setFormError(fieldError.message)
				}
				helpers.setErrors(errors)
				return
			}

			closeModal()
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
							>
								Create account
							</Button>
							<FormError message={meta.formError} />
							<p
								className={css({
									fontFamily: "mono",
									fontSize: "2xs",
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
