import { teamNickname } from "@called-my-shot/schemas"
import { Link } from "@tanstack/react-router"
import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import { watchGameDay } from "#/components/arcade/were-you-watching/watch-codes"
import { Card } from "#/components/ui/card"
import { SectionLabel } from "#/components/ui/section-label"
import type { GroupWatchRecentQuery } from "#/graphql/generated/graphql"
import { teamSlug } from "#/lib/team-slug"
import { GroupWatchMemberRow } from "./group-watch-member-row"

type Board = NonNullable<
	NonNullable<GroupWatchRecentQuery["group"]>["watchRecent"]
>[number]

// One team's quiz members took this week, best first, with a link to take
// it while it's still up.
export function GroupWatchQuiz({ board }: { board: Board }) {
	const { quiz } = board
	return (
		<VStack gap="3" alignItems="stretch">
			<div
				className={css({
					display: "flex",
					alignItems: "center",
					justifyContent: "space-between",
					gap: "3",
				})}
			>
				<SectionLabel>
					{teamNickname(quiz.team.name)} vs {teamNickname(quiz.opponent.name)} ·{" "}
					{watchGameDay(quiz.gameStartsAt)}
				</SectionLabel>
				{quiz.live && (
					<Link
						to="/arcade/were-you-watching/$leagueSlug/$teamSlug"
						params={{
							leagueSlug: quiz.league.slug,
							teamSlug: teamSlug(quiz.team.abbreviation),
						}}
						className={css({
							textStyle: "label",
							color: "primary.default",
							_hover: { textDecoration: "underline" },
						})}
					>
						Take it
					</Link>
				)}
			</div>
			<Card>
				{board.members.map((row) => (
					<GroupWatchMemberRow
						key={row.user.id}
						row={row}
						total={quiz.questionCount}
					/>
				))}
			</Card>
		</VStack>
	)
}
