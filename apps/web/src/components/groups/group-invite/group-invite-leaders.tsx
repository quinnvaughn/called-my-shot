import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import { Card } from "#/components/ui/card"
import { Eyebrow } from "#/components/ui/eyebrow"
import { GroupInviteLeaderRow } from "./group-invite-leader-row"
import type { GroupPreviewLeader } from "./types"

// The top of the board a joiner lands on: this season, the group's leagues.
export function GroupInviteLeaders({
	leaders,
}: {
	leaders: GroupPreviewLeader[]
}) {
	return (
		<VStack gap="3" alignItems="stretch">
			<Eyebrow variant="neutral">Leaderboard this season</Eyebrow>
			<Card>
				<Card.Body>
					<VStack
						gap="0"
						alignItems="stretch"
						className={css({
							"& > * + *": {
								borderTop: "1px solid {colors.border.default}",
							},
						})}
					>
						{leaders.map((leader) => (
							<GroupInviteLeaderRow key={leader.username} leader={leader} />
						))}
					</VStack>
				</Card.Body>
			</Card>
		</VStack>
	)
}
