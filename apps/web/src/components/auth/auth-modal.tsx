import {
	requestPasswordResetSchema,
	signInSchema,
	signUpSchema,
} from "@called-my-shot/schemas"
import { useQueryClient } from "@tanstack/react-query"
import { useNavigate, useRouter, useRouterState } from "@tanstack/react-router"
import { useMemo, useState } from "react"
import { FcGoogle } from "react-icons/fc"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { match } from "ts-pattern"
import { Button } from "#/components/ui/button"
import { Modal } from "#/components/ui/modal"
import { Tabs } from "#/components/ui/tabs"
import { TextInput } from "#/components/ui/text-input"
import { useGqlMutation } from "#/graphql/hooks"
import {
	RequestPasswordResetDocument,
	SignInDocument,
	SignUpDocument,
} from "#/graphql/mutations/auth"
import { track } from "#/lib/analytics"
import { useForm } from "#/lib/form/use-form"
import { startGoogleAuth } from "#/lib/google-auth"
import { readLastSignInMethod, rememberSignInMethod } from "#/lib/last-sign-in"
import { markGuestPicksEntry } from "#/stores/guest-picks-store"
import { closeModal } from "#/stores/modal-store"
import { clearReferral, readReferral } from "#/stores/referral-store"
import { showToast } from "#/stores/toast-store"
import { Brand } from "../ui/brand"
import { FormError } from "../ui/form-error"
import { Tag } from "../ui/tag"

// How long after the post-signup navigation the welcome toast waits. Long
// enough for the destination to have mounted, so the toast lands on the page
// the new account is actually looking at rather than on the one dissolving
// behind it.
const TOAST_AFTER_NAV_MS = 400

// "forgot" is reached from the sign-in form's link, or opened directly by a
// reset page whose link has expired. It has no tab of its own.
export type AuthModalView = "signin" | "signup" | "forgot"

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

export type AuthModalSurface = "guest_picks" | "call_page" | "default"

const defaultCopy: AuthModalCopy = {
	signin: {
		title: "Welcome back",
		description: "Sign in to make your calls.",
	},
	signup: {
		title: "Make your first call",
		description: "Free to play. Takes about 30 seconds.",
	},
	forgot: {
		title: "Reset your password",
		description:
			"Enter the email on your account and we'll send you a link to set a new password.",
	},
}

export function AuthModal({
	defaultView = "signin",
	copy,
	onSuccess,
	surface = "default",
}: AuthModalProps) {
	const [view, setView] = useState<AuthModalView>(defaultView)
	const [lastMethod] = useState(readLastSignInMethod)
	// Whatever was typed into sign-in's identifier field, if it was an email,
	// so the reset form doesn't ask for it twice.
	const [resetEmail, setResetEmail] = useState("")

	const { title, description } = {
		...defaultCopy[view],
		...copy?.[view],
	}

	if (view === "forgot") {
		return (
			<Modal>
				<Modal.CloseButton />
				<Brand size="sm" />
				<ForgotPasswordFields
					title={title}
					description={description}
					defaultEmail={resetEmail}
					onBack={() => setView("signin")}
				/>
			</Modal>
		)
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
			<GoogleButton
				hasOnSuccess={Boolean(onSuccess)}
				surface={surface}
				lastUsed={view === "signin" && lastMethod === "google"}
			/>
			<OrDivider />
			{view === "signin" ? (
				<SignInFields
					onSuccess={onSuccess}
					surface={surface}
					lastUsed={lastMethod === "email"}
					onForgotPassword={(identifier) => {
						setResetEmail(identifier.includes("@") ? identifier.trim() : "")
						setView("forgot")
					}}
				/>
			) : (
				<SignUpFields onSuccess={onSuccess} surface={surface} />
			)}
		</Modal>
	)
}

// One button for both tabs: Google signs an existing account in and creates
// a new one, so which tab someone was on doesn't matter.
//
// A signup here lands back on the page it started from when the caller had
// something to resume there, and on /home otherwise, the same split as the
// email forms' onSuccess. The resumed action itself can't survive the trip
// through Google, only the page it was on.
function GoogleButton({
	hasOnSuccess,
	surface,
	lastUsed,
}: {
	hasOnSuccess: boolean
	surface: AuthModalSurface
	lastUsed: boolean
}) {
	const href = useRouterState({ select: (s) => s.location.href })
	const [leaving, setLeaving] = useState(false)

	return (
		<LastUsed show={lastUsed}>
			<Button
				type="button"
				variant="outline"
				size="md"
				fullWidth
				loading={leaving}
				disabled={leaving}
				className={css({
					fontFamily: "heading",
					textTransform: "uppercase",
					letterSpacing: "wide",
				})}
				onClick={() => {
					setLeaving(true)
					startGoogleAuth({ surface, returnTo: hasOnSuccess ? href : "/home" })
				}}
			>
				<FcGoogle size={18} />
				Continue with Google
			</Button>
		</LastUsed>
	)
}

// Pins a small "Last used" tag to the top corner of whichever way in this
// browser used last, so someone with both doesn't have to remember which.
function LastUsed({
	show,
	children,
}: {
	show: boolean
	children: React.ReactNode
}) {
	if (!show) return children
	return (
		<div className={css({ position: "relative" })}>
			{children}
			<span
				className={css({
					position: "absolute",
					top: "-2",
					right: "3",
					bg: "bg.default",
					pointerEvents: "none",
				})}
			>
				<Tag size="sm" variant="primary">
					Last used
				</Tag>
			</span>
		</div>
	)
}

function OrDivider() {
	const rule = css({ flex: "1", height: "1px", bg: "border.default" })
	return (
		<HStack gap="3" alignItems="center">
			<span className={rule} />
			<span
				className={css({
					fontFamily: "mono",
					fontSize: "3xs",
					color: "fg.subtle",
					textTransform: "uppercase",
				})}
			>
				or
			</span>
			<span className={rule} />
		</HStack>
	)
}

const subtleLinkClass = css({
	fontFamily: "mono",
	fontSize: "3xs",
	color: "fg.subtle",
	textAlign: "center",
	textDecoration: "underline",
	cursor: "pointer",
	_hover: { color: "fg.default" },
})

type FieldsProps = {
	onSuccess?: () => void
	surface: AuthModalSurface
}

function SignInFields({
	onSuccess,
	surface,
	lastUsed,
	onForgotPassword,
}: FieldsProps & {
	lastUsed: boolean
	onForgotPassword: (identifier: string) => void
}) {
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
					rememberSignInMethod("email")
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
							<LastUsed show={lastUsed}>
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
							</LastUsed>
							<FormError message={meta.formError} />
							<button
								type="button"
								onClick={() => onForgotPassword(form.values().identifier)}
								className={subtleLinkClass}
							>
								Forgot password?
							</button>
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
}: {
	value: string
	onChange: (next: string) => void
	onBlur: () => void
	error?: string
}) {
	const [open, setOpen] = useState(false)

	if (!open) {
		return (
			<button
				type="button"
				onClick={() => setOpen(true)}
				className={subtleLinkClass}
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
	// the link. Applied as-is with no field shown: the link already said whose
	// invite this is, and a prefilled box only invites someone to wonder
	// whether they're meant to change it.
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
			const referralSource = captured
				? captured.source
				: values.referralCode
					? "manual_code"
					: null

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
					rememberSignInMethod("email")
					if (values.referralCode) {
						track("referral_code_entered", { prefilled: Boolean(captured) })
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
					{/* Only when no link captured a code: it's for the person
					whose friend read a code out to them, which is the case a
					link can't serve. */}
					{!captured && (
						<form.Field name="referralCode">
							{(field) => (
								<InviteCodeField
									value={field.value ?? ""}
									onChange={field.onChange}
									onBlur={field.onBlur}
									error={field.meta.error ?? undefined}
								/>
							)}
						</form.Field>
					)}
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

// Swaps itself for a "check your email" note once sent. The server answers
// the same whether or not the email has an account, so the note can't say
// which it was either.
function ForgotPasswordFields({
	title,
	description,
	defaultEmail,
	onBack,
}: {
	title: string
	description: string
	defaultEmail: string
	onBack: () => void
}) {
	const requestReset = useGqlMutation(RequestPasswordResetDocument)
	const [sentTo, setSentTo] = useState<string | null>(null)

	const form = useForm({
		schema: requestPasswordResetSchema,
		defaultValues: { email: defaultEmail },
		onSubmit: async (values, helpers) => {
			const data = await requestReset.mutateAsync({ input: values })
			const result = data?.requestPasswordReset

			if (!result) {
				helpers.setFormError("Something went wrong. Try again.")
				return
			}

			match(result)
				.with({ __typename: "ValidationError" }, (r) => {
					const errors: Record<string, string | null> = {}
					for (const fieldError of r.fieldErrors ?? []) {
						if (fieldError.field) errors[fieldError.field] = fieldError.message
						else helpers.setFormError(fieldError.message)
					}
					helpers.setErrors(errors)
				})
				.with({ __typename: "MutationRequestPasswordResetSuccess" }, () => {
					track("password_reset_requested", {})
					setSentTo(values.email)
				})
				.exhaustive()
		},
	})

	const backButton = (
		<button type="button" onClick={onBack} className={subtleLinkClass}>
			Back to sign in
		</button>
	)

	if (sentTo) {
		return (
			<VStack gap="5" alignItems="stretch">
				<VStack gap="1" alignItems="flex-start">
					<Modal.Title>Check your email</Modal.Title>
					<Modal.Description>
						If an account uses {sentTo}, we sent it a link to reset your
						password. The link expires in 1 hour.
					</Modal.Description>
				</VStack>
				{backButton}
			</VStack>
		)
	}

	return (
		<VStack gap="5" alignItems="stretch">
			<VStack gap="1" alignItems="flex-start">
				<Modal.Title>{title}</Modal.Title>
				<Modal.Description>{description}</Modal.Description>
			</VStack>
			<form onSubmit={form.handleSubmit}>
				<VStack gap="5" alignItems="stretch">
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
									Send reset link
								</Button>
								<FormError message={meta.formError} />
								{backButton}
							</VStack>
						)}
					</form.Subscribe>
				</VStack>
			</form>
		</VStack>
	)
}
