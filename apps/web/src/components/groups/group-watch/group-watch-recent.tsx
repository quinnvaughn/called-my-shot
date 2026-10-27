import { useSuspenseQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import { button } from "#/components/ui/button"
import { EmptyState } from "#/components/ui/empty-state"
import { SectionLabel } from "#/components/ui/section-label"
import { groupWatchRecentQuery } from "#/graphql/were-you-watching/queries"
import { GroupWatchQuiz } from "./group-watch-quiz"

// The Were You Watching? quizzes members took this week, the most taken
// first. Each team's quiz is its own, so a group following different teams
// sees each one.
export function GroupWatchRecent({ groupId }: { groupId: string }) {
	const { data } = useSuspenseQuery(groupWatchRecentQuery(groupId))
	const boards = data.group?.watchRecent
	if (!boards) return null

	return (
		<VStack gap="4" alignItems="stretch">
			<div
				className={css({
					display: "flex",
					alignItems: "center",
					justifyContent: "space-between",
					gap: "3",
				})}
			>
				<SectionLabel>Were You Watching? this week</SectionLabel>
				<Link
					to="/arcade/were-you-watching"
					className={button({ variant: "solid", size: "sm" })}
				>
					Pick a team
				</Link>
			</div>
			{boards.length === 0 ? (
				<EmptyState>
					Nobody here has taken a team's quiz this week. Each game gets one once
					its box score is in.
				</EmptyState>
			) : (
				boards.map((board) => (
					<GroupWatchQuiz key={board.quiz.id} board={board} />
				))
			)}
		</VStack>
	)
}
