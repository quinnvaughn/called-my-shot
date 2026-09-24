import { signInSchema, signUpSchema } from "@called-my-shot/schemas"
import { useQueryClient } from "@tanstack/react-query"
import { useNavigate, useRouter } from "@tanstack/react-router"
import { useMemo, useState } from "react"
import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import { match } from "ts-pattern"
import { Button } from "#/components/ui/button"
import { Modal } from "#/components/ui/modal"
import { Tabs } from "#/components/ui/tabs"
import { TextInput } from "#/components/ui/text-input"
import { useGqlMutation } from "#/graphql/hooks"
import { SignInDocument, SignUpDocument } from "#/graphql/mutations/auth"
import { track } from "#/lib/analytics"
import { useForm } from "#/lib/form/use-form"
import { markGuestPicksEntry } from "#/stores/guest-picks-store"
import { closeModal } from "#/stores/modal-store"
import { clearReferral, readReferral } from "#/stores/referral-store"
import { showToast } from "#/stores/toast-store"
import { Brand } from "../ui/brand"
import { FormError } from "../ui/form-error"

// How long after the post-signup navigation the welcome toast waits. Long
// enough for the destination to have mounted, so the toast lands on the page
// the new account is actually looking at rather than on the one dissolving
// behind it.
const TOAST_AFTER_NAV_MS = 400

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
	// Where the modal was opened from, recorded on the signed-up/signed-in
	// event.
	surface?: AuthModalSurface
}

export type AuthModalSurface = "guest_picks" | "default"

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
	surface = "default",
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
				<SignInFields onSuccess={onSuccess} surface={surface} />
			) : (
				<SignUpFields onSuccess={onSuccess} surface={surface} />
			)}
		</Modal>
	)
}

type FieldsProps = {
	onSuccess?: () => void
	surface: AuthModalSurface
}

function SignInFields({ onSuccess, surface }: FieldsProps) {
	const signIn = useGqlMutation(SignInDocument)
	const router = useRouter()
	const queryClient = useQueryClient()
	const navigate = useNavigate()

	const form = useForm({
		schema: signInSchema,
		defaultValues: { identifier: "", password: "" },
		onSubmit: async (values, helpers) => {
			const data = await signIn.mutateAsync({ input: values })
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
					track("user_signed_in", { method: "email", surface })
					markGuestPicksEntry("signin")
					queryClient.clear()
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

// The invite code row on signup. A friend's code is worth a redo to both
// people, so it can't be buried, but it's blank for most signups and a sixth
// empty box reads as more work to create an account.
function InviteCodeField({
	value,
	onChange,
	onBlur,
	error,
	startOpen,
}: {
	value: string
	onChange: (next: string) => void
	onBlur: () => void
	error?: string
	startOpen: boolean
}) {
	const [open, setOpen] = useState(startOpen)

	if (!open) {
		return (
			<button
				type="button"
				onClick={() => setOpen(true)}
				className={css({
					fontFamily: "mono",
					fontSize: "3xs",
					color: "fg.subtle",
					textAlign: "center",
					textDecoration: "underline",
					cursor: "pointer",
					_hover: { color: "fg.default" },
				})}
			>
				Got an invite code?
			</button>
		)
	}

	return (
		<TextInput error={error} description="You both get a redo.">
			<TextInput.Label>Invite code</TextInput.Label>
			<TextInput.Group>
				<TextInput.Field
					type="text"
					placeholder="ABC123"
					autoCapitalize="characters"
					autoComplete="off"
					value={value}
					// Uppercased as it's typed so the field matches the codes
					// people are reading off a screen. The server normalizes
					// too; this is only so it doesn't look wrong while typing.
					onChange={(e) => onChange(e.target.value.toUpperCase())}
					onBlur={onBlur}
				/>
			</TextInput.Group>
		</TextInput>
	)
}

function SignUpFields({ onSuccess, surface }: FieldsProps) {
	const signUp = useGqlMutation(SignUpDocument)
	const router = useRouter()
	const queryClient = useQueryClient()
	const navigate = useNavigate()

	// Whatever /join/:code captured, if this browser is the one that opened
	// the link. Read once on mount rather than per keystroke so typing in the
	// field can override it.
	const captured = useMemo(() => readReferral(), [])

	const form = useForm({
		schema: signUpSchema,
		defaultValues: {
			name: "",
			username: "",
			email: "",
			password: "",
			referralCode: captured?.code ?? "",
		},
		onSubmit: async (values, helpers) => {
			// Typing over a captured code makes it a manual entry, since the
			// link is no longer what brought the code in.
			const referralSource = !values.referralCode
				? null
				: values.referralCode === captured?.code
					? captured.source
					: "manual_code"

			const data = await signUp.mutateAsync({
				input: {
					...values,
					referralSource: match(referralSource)
						.with("invite_link", () => "INVITE_LINK" as const)
						.with("manual_code", () => "MANUAL_CODE" as const)
						.with(null, () => null)
						.exhaustive(),
				},
			})
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
				.with({ __typename: "AuthPayload" }, async (r) => {
					track("user_signed_up", { method: "email", surface, referralSource })
					if (values.referralCode) {
						track("referral_code_entered", {
							prefilled: values.referralCode === captured?.code,
						})
					}
					// Spent. A second account made in this browser shouldn't be
					// credited to the same person again.
					clearReferral()
					markGuestPicksEntry("signup")
					queryClient.clear()
					await router.invalidate()
					closeModal()
					if (onSuccess) onSuccess()
					else await navigate({ to: "/home" })

					// After the navigation, and a beat behind it. This is the
					// one moment the account is told it already owns a redo -
					// the grant is silent in the database and the invitee gets
					// no notification - and a toast queued before the route
					// swaps spends most of its few seconds on the page they are
					// leaving. Fired off the server's answer rather than off
					// "they typed a code", since a code that matched nothing
					// grants nothing.
					if (r.redoGranted) {
						setTimeout(() => {
							showToast({
								message:
									"You've got a redo. It can change one call before that question locks.",
								// The hash opens the Redos section rather than
								// landing them on a closed accordion header, the
								// same way the resolution link works.
								action: {
									label: "What's a redo?",
									to: "/how-it-works",
									hash: "redos",
								},
							})
						}, TOAST_AFTER_NAV_MS)
					}
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
					{/* Open already when a link filled it in, so someone who
					clicked an invite can see their code made it through.
					Otherwise collapsed: it's for the person whose friend read a
					code out to them, which is the case a link can't serve. */}
					<form.Field name="referralCode">
						{(field) => (
							<InviteCodeField
								value={field.value ?? ""}
								onChange={field.onChange}
								onBlur={field.onBlur}
								error={field.meta.error ?? undefined}
								startOpen={Boolean(captured?.code)}
							/>
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
