import { Link } from "@tanstack/react-router"
import { css, cx } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import { track } from "#/lib/analytics"
import { presserBodyText, presserEyebrow } from "./presser-qa-item"

type Props = {
	callId: string
	presser: {
		id: string
		statement: string | null
		owner: { username: string }
		game: { id: string }
	}
	// The app's answered questions about this call.
	questions: {
		id: string
		body: string
		answer: string | null
		noComment: boolean
	}[]
}

const clamp = css({ lineClamp: 3 })

// What the caller said about this call after the game: their opening
// statement and the app's questions about this call they answered. The full
// presser, every call on the game, is on their picks page.
export function CallPresserExcerpt({ callId, presser, questions }: Props) {
	if (!presser.statement && questions.length === 0) return null
	const { username } = presser.owner

	return (
		<VStack
			gap="3"
			alignItems="stretch"
			className={css({
				padding: "5",
				borderRadius: "xl",
				bg: "bg.surface",
				border: "1px solid {colors.border.default}",
			})}
		>
			<span className={presserEyebrow}>
				From @{username}'s post-game presser
			</span>
			{presser.statement && (
				<p className={cx(presserBodyText, clamp)}>{presser.statement}</p>
			)}
			{questions.map((q) => (
				<VStack key={q.id} gap="1" alignItems="stretch">
					<p className={css({ fontSize: "sm", fontWeight: "semibold" })}>
						{q.body}
					</p>
					<p className={cx(presserBodyText, clamp)}>
						{q.noComment ? "No comment." : q.answer}
					</p>
				</VStack>
			))}
			<Link
				to="/games/$gameId/picks/$username"
				params={{ gameId: presser.game.id, username }}
				hash="presser"
				onClick={() =>
					track("presser_excerpt_clicked", { presserId: presser.id, callId })
				}
				className={css({
					fontFamily: "mono",
					fontSize: "2xs",
					letterSpacing: "wide",
					textTransform: "uppercase",
					color: "primary.default",
					textDecoration: "none",
					_hover: { opacity: 0.8 },
				})}
			>
				Read the full presser →
			</Link>
		</VStack>
	)
}
