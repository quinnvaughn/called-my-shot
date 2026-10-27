import { possessive, teamNickname } from "@called-my-shot/schemas"
import { css } from "styled-system/css"

// A team with no game recent enough to quiz on: the offseason, or a team
// that hasn't played yet.
export function WatchStalePanel({
	teamName,
	hasQuiz,
}: {
	teamName: string
	hasQuiz: boolean
}) {
	const team = teamNickname(teamName)
	return (
		<section
			aria-label="No quiz right now"
			className={css({
				display: "flex",
				flexDirection: "column",
				gap: "3",
				padding: { base: "5", md: "8" },
				borderRadius: "2xl",
				bg: "bg.subtle",
				color: "fg.muted",
				border: "1px dashed {colors.border.emphasized}",
			})}
		>
			<span className={css({ textStyle: "label", fontWeight: "bold" })}>
				Were You Watching?
			</span>
			<h1
				className={css({
					fontFamily: "heading",
					fontSize: { base: "2xl", md: "4xl" },
					lineHeight: "1",
					color: "fg.default",
				})}
			>
				No recent {team} game
			</h1>
			<p>
				{hasQuiz
					? `Back when the season starts. The quiz on the ${possessive(team)} last game is closed, but its board is below.`
					: "Back when the season starts. Each game gets a quiz once its box score is in."}
			</p>
		</section>
	)
}
