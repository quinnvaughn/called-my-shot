import { css } from "styled-system/css"
import { HStack } from "styled-system/jsx"
import { FavoriteTeamsPickerModal } from "#/components/teams/favorite-teams-picker-modal"
import {
	type FavoriteTeam,
	FavoriteTeamsRow,
} from "#/components/teams/favorite-teams-row"
import { Button } from "#/components/ui/button"
import { Card } from "#/components/ui/card"
import { openModal } from "#/stores/modal-store"

export function FavoriteTeamsSection({ teams }: { teams: FavoriteTeam[] }) {
	return (
		<Card size="sm" variant="surface">
			<Card.Body>
				<HStack
					justify="space-between"
					alignItems="center"
					gap="3"
					flexWrap="wrap"
				>
					{teams.length > 0 ? (
						<FavoriteTeamsRow teams={teams} />
					) : (
						<HStack gap="3" alignItems="center" minWidth="0">
							<span className={css({ fontSize: "sm", color: "fg.muted" })}>
								No teams yet
							</span>
							<span className={css({ fontSize: "xs", color: "fg.subtle" })}>
								Shows on your profile.
							</span>
						</HStack>
					)}
					<Button
						variant="outline"
						size="sm"
						onClick={() =>
							openModal(
								<FavoriteTeamsPickerModal
									initialTeamIds={teams.map((team) => team.id)}
								/>,
							)
						}
					>
						{teams.length > 0 ? "Edit" : "Choose"}
					</Button>
				</HStack>
			</Card.Body>
		</Card>
	)
}
