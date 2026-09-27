import { useNavigate } from "@tanstack/react-router"
import { css } from "styled-system/css"
import { Flex, VStack } from "styled-system/jsx"
import { match } from "ts-pattern"
import { AuthModal } from "#/components/auth/auth-modal"
import { Button } from "#/components/ui/button"
import { openModal } from "#/stores/modal-store"

// A size down on a phone, where this is a bar pinned over the card rather
// than a box beside it.
const promptClass = css({
	fontSize: { base: "sm", md: "md" },
	fontWeight: "semibold",
	color: "fg.default",
})

const subClass = css({
	fontSize: { base: "xs", md: "sm" },
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
		// Below md the card fills the first screen or more, so a box under it
		// is out of sight for most of the read. It sticks to the bottom of the
		// viewport instead, over a backdrop that runs edge to edge, and settles
		// back into place under the card once the page scrolls down to it.
		// Nothing past that point is a reason to sign up, so it doesn't follow
		// the reader any further. From md up it's an ordinary box in the flow.
		<Flex
			direction={{ base: "column", md: "row" }}
			gap={{ base: "3", md: "4" }}
			alignItems={{ base: "stretch", md: "center" }}
			justify="space-between"
			className={css({
				position: "sticky",
				bottom: "0",
				zIndex: 10,
				paddingBlock: "3",
				_before: {
					content: '""',
					position: "absolute",
					insetBlock: "0",
					left: "50%",
					width: "100vw",
					transform: "translateX(-50%)",
					zIndex: -1,
					bg: "bg.canvas/92",
					backdropFilter: "blur(10px)",
					borderTop: "1px solid {colors.border.default}",
					// Only visible once it has settled mid-page; pinned, it sits
					// on the viewport's edge.
					borderBottom: "1px solid {colors.border.default}",
				},
				md: {
					position: "static",
					padding: "5",
					borderRadius: "lg",
					border: "1px solid {colors.border.default}",
					background: "bg.subtle",
					_before: { display: "none" },
				},
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
