import { Link } from "@tanstack/react-router"
import { css } from "styled-system/css"
import { queueGameLine } from "#/lib/admin/queue-game-line"
import type { QueueGame } from "./types"

export function QuestionHeading({
	question,
}: {
	question: { id: string; title: string; game?: QueueGame | null }
}) {
	const line = queueGameLine(question.game)
	return (
		<>
			{line && (
				<span
					className={css({
						fontFamily: "mono",
						fontSize: "2xs",
						letterSpacing: "wide",
						color: "fg.muted",
					})}
				>
					{line}
				</span>
			)}
			<Link
				to="/questions/$questionId/{-$slug}"
				params={{ questionId: question.id }}
				target="_blank"
				className={css({
					fontSize: "sm",
					fontWeight: "medium",
					color: "fg.default",
					textDecoration: "none",
					_hover: { textDecoration: "underline" },
				})}
			>
				{question.title}
			</Link>
		</>
	)
}
