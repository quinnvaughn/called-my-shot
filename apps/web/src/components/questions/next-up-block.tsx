import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import { GameCardContext } from "#/components/games/game-card-context"
import type { GameNextUp } from "#/components/questions/use-game-next-up"
import { button } from "#/components/ui/button"
import { nextUpQuestionQuery } from "#/graphql/questions/queries"
import { track } from "#/lib/analytics"
import { buildQuestionSlug } from "#/lib/slug"

type Props = {
	fromQuestionId: string
	nextUp: GameNextUp
}

// Right under a call the viewer just made: the next question on the game,
// with its line of recent form and group picks, and one way in. The call
// itself is made on that question's page, beside the stats it's made from.
export function NextUpBlock({ fromQuestionId, nextUp }: Props) {
	const { data } = useQuery(nextUpQuestionQuery(nextUp.next.questionId))
	const question = data?.question ?? null
	const params = {
		questionId: nextUp.next.questionId,
		slug: buildQuestionSlug(nextUp.next.title),
	}
	const tapped = () =>
		track("next_up_tapped", {
			fromQuestionId,
			toQuestionId: nextUp.next.questionId,
			aboutPickedTeam: nextUp.leadInTeamName !== null,
		})

	return (
		<VStack
			gap="3"
			alignItems="stretch"
			className={css({
				padding: "4",
				borderRadius: "lg",
				backgroundColor: "bg.canvas/60",
				border: "1px solid {colors.border.default}",
			})}
		>
			<span
				className={css({
					textStyle: "label",
					color: "secondary.default",
				})}
			>
				Next up · {nextUp.openCount} more open on {nextUp.matchup}
			</span>
			<VStack gap="1" alignItems="stretch">
				{nextUp.leadInTeamName && (
					<span className={css({ fontSize: "sm", color: "fg.muted" })}>
						You've got the {nextUp.leadInTeamName}.
					</span>
				)}
				<Link
					to="/questions/$questionId/{-$slug}"
					params={params}
					onClick={tapped}
					className={css({
						fontWeight: "bold",
						fontSize: "md",
						lineHeight: "snug",
						color: "fg.default",
						textDecoration: "none",
						_hover: { textDecoration: "underline" },
					})}
				>
					{nextUp.next.title}
				</Link>
			</VStack>
			{question && <GameCardContext question={question} />}
			<Link
				to="/questions/$questionId/{-$slug}"
				params={params}
				onClick={tapped}
				className={button({ variant: "solid", size: "sm" })}
			>
				Make this call
			</Link>
		</VStack>
	)
}
