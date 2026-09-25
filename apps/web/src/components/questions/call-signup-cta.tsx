import { useNavigate } from "@tanstack/react-router"
import { css } from "styled-system/css"
import { Flex, VStack } from "styled-system/jsx"
import { match } from "ts-pattern"
import { AuthModal } from "#/components/auth/auth-modal"
import { Button } from "#/components/ui/button"
import { openModal } from "#/stores/modal-store"

const promptClass = css({
	fontSize: "md",
	fontWeight: "semibold",
	color: "fg.default",
})

const subClass = css({
	fontSize: "sm",
	color: "fg.muted",
})

// Where the call's question stands, as far as a visitor deciding whether to
// sign up is concerned. Only "open" can still take a call on this question;
// every other state points at the league's open questions instead.
export type CallSignupState =
	| { kind: "open" }
	| { kind: "hit" }
	| { kind: "miss" }
	// Locked, awaiting a result, voided, or resolved without scoring this
	// call - no verdict on the caller to lead with.
	| { kind: "closed" }

// The signed-out visitor's way in from a call someone sent them. Signing up
// lands them where the next call gets made: the question page while this
// question is open, the league page once it isn't.
export function CallSignupCta({
	state,
	username,
	questionId,
	slug,
	leagueSlug,
}: {
	state: CallSignupState
	username: string
	questionId: string
	slug: string | undefined
	leagueSlug: string
}) {
	const navigate = useNavigate()

	const leagueCopy = {
		sub: "Free to play. Takes about 30 seconds.",
		action: "Make your first call",
		go: () => navigate({ to: "/leagues/$leagueSlug", params: { leagueSlug } }),
	}

	const copy = match(state)
		.with({ kind: "open" }, () => ({
			prompt: "Want to make your own call on this question?",
			sub: "Free to play. Takes about 30 seconds.",
			action: "Make your call",
			go: () =>
				navigate({
					to: "/questions/$questionId/{-$slug}",
					params: { questionId, slug },
				}),
		}))
		.with({ kind: "hit" }, () => ({
			prompt: `@${username} got this one right. Think you can call the next one?`,
			...leagueCopy,
		}))
		.with({ kind: "miss" }, () => ({
			prompt: `@${username} got this one wrong. Think you'd have called it?`,
			...leagueCopy,
		}))
		.with({ kind: "closed" }, () => ({
			prompt: "This question is closed. Make your own call on the next one.",
			...leagueCopy,
		}))
		.exhaustive()

	return (
		<Flex
			direction={{ base: "column", sm: "row" }}
			gap="4"
			alignItems={{ base: "stretch", sm: "center" }}
			justify="space-between"
			className={css({
				padding: "5",
				borderRadius: "lg",
				border: "1px solid {colors.border.default}",
				background: "bg.subtle",
			})}
		>
			<VStack gap="1" alignItems="flex-start">
				<span className={promptClass}>{copy.prompt}</span>
				<span className={subClass}>{copy.sub}</span>
			</VStack>
			<Button
				variant="solid"
				size="md"
				onClick={() =>
					openModal(
						<AuthModal
							defaultView="signup"
							surface="call_page"
							copy={{
								signup: { title: "Make your own call" },
								signin: { title: "Make your own call" },
							}}
							onSuccess={() => void copy.go()}
						/>,
					)
				}
			>
				{copy.action}
			</Button>
		</Flex>
	)
}
