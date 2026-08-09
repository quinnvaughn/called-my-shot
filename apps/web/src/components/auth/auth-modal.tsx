import { useState } from "react"
import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import { Button } from "#/components/ui/button"
import { Modal } from "#/components/ui/modal"
import { Tabs } from "#/components/ui/tabs"
import { TextInput } from "#/components/ui/text-input"
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

function SignInFields() {
	return (
		<VStack gap="5" alignItems="stretch">
			<VStack gap="3.5" alignItems="stretch">
				<TextInput>
					<TextInput.Label>Email or handle</TextInput.Label>
					<TextInput.Group>
						<TextInput.Field
							type="text"
							placeholder="you@email.com or @handle"
							autoComplete="username"
						/>
					</TextInput.Group>
				</TextInput>
				<TextInput>
					<TextInput.Label>Password</TextInput.Label>
					<TextInput.Password
						placeholder="At least 8 characters"
						autoComplete="current-password"
					/>
				</TextInput>
			</VStack>
			<Button variant="solid" size="md" fullWidth>
				Sign in
			</Button>
		</VStack>
	)
}

function SignUpFields() {
	return (
		<VStack gap="5" alignItems="stretch">
			<VStack gap="3.5" alignItems="stretch">
				<TextInput>
					<TextInput.Label>Name</TextInput.Label>
					<TextInput.Group>
						<TextInput.Field
							type="text"
							placeholder="Full name"
							autoComplete="name"
						/>
					</TextInput.Group>
				</TextInput>
				<TextInput>
					<TextInput.Label>Handle</TextInput.Label>
					<TextInput.Group>
						<TextInput.Field
							type="text"
							placeholder="@yourhandle"
							autoComplete="username"
						/>
					</TextInput.Group>
				</TextInput>
				<TextInput>
					<TextInput.Label>Email</TextInput.Label>
					<TextInput.Group>
						<TextInput.Field
							type="email"
							placeholder="you@email.com"
							autoComplete="email"
						/>
					</TextInput.Group>
				</TextInput>
				<TextInput>
					<TextInput.Label>Password</TextInput.Label>
					<TextInput.Password
						placeholder="At least 8 characters"
						autoComplete="new-password"
					/>
				</TextInput>
			</VStack>
			<VStack gap="3.5" alignItems="stretch">
				<Button variant="solid" size="md" fullWidth>
					Create account
				</Button>
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
		</VStack>
	)
}
