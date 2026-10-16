import { useState } from "react"
import { VStack } from "styled-system/jsx"
import { Brand } from "#/components/ui/brand"
import { Modal } from "#/components/ui/modal"
import { Tabs } from "#/components/ui/tabs"
import type {
	AuthModalCopy,
	AuthModalCopyOverride,
	AuthModalSurface,
	AuthModalView,
} from "#/lib/auth-modal-copy"
import { readLastSignInMethod } from "#/lib/last-sign-in"
import type { AuthIntent } from "#/stores/auth-intent-store"
import { ForgotPasswordFields } from "./forgot-password-fields"
import { GoogleButton } from "./google-button"
import { OrDivider } from "./or-divider"
import { SignInFields } from "./sign-in-fields"
import { SignUpFields } from "./sign-up-fields"

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
	// onSuccess written down, for the one path that can't run a callback: a
	// Google signup leaves the page and comes back. Optional, since not every
	// gated action has been given one.
	intent?: AuthIntent
	// Where the modal was opened from, recorded on the signed-up/signed-in
	// event.
	surface?: AuthModalSurface
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
	intent,
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
				intent={intent ?? null}
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
