import { useNavigate } from "@tanstack/react-router"
import { match } from "ts-pattern"
import { AuthModal } from "#/components/auth/auth-modal"
import { PromptCta } from "#/components/ui/prompt-cta"
import { openModal } from "#/stores/modal-store"

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

	// What the app is, for a visitor who has only ever seen this one card.
	// "No money" because a card with points and a line on it reads like a
	// bet to anyone who doesn't know otherwise.
	const sub =
		"Call games, whole seasons, or your own questions before they play out. Free, no money ever."

	const leagueCopy = {
		sub,
		action: "Make your first call",
		go: () => navigate({ to: "/leagues/$leagueSlug", params: { leagueSlug } }),
	}

	const copy = match(state)
		.with({ kind: "open" }, () => ({
			prompt: "Want to make your own call on this question?",
			sub,
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
		// Below md the card fills the first screen or more, so it pins to the
		// bottom of the viewport. Nothing past the card is a reason to sign
		// up, so it settles back under the card instead of following the
		// reader any further.
		<PromptCta
			sticky
			prompt={copy.prompt}
			sub={copy.sub}
			action={copy.action}
			onAction={() =>
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
		/>
	)
}
