import { DateTime } from "luxon"
import type { ReactNode } from "react"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { FavoriteTeamsPickerModal } from "#/components/teams/favorite-teams-picker-modal"
import {
	type FavoriteTeam,
	FavoriteTeamsRow,
} from "#/components/teams/favorite-teams-row"
import { Avatar } from "#/components/ui/avatar"
import { Button } from "#/components/ui/button"
import { Flair, type FlairData } from "#/components/ui/flair"
import { openModal } from "#/stores/modal-store"
import { EditNameModal } from "./edit-name-modal"
import { EditableAvatar } from "./editable-avatar"

type Props = {
	user: {
		id: string
		name: string
		username: string
		avatarUrl?: string | null
		createdAt: string
		flair?: FlairData | null
		favoriteTeams: FavoriteTeam[]
	}
	viewerId?: string
	// The profile's share row, beside Edit. Null until there's a record to
	// share.
	share?: ReactNode
}

const teamsEditButton = css({
	fontSize: "xs",
	fontWeight: "medium",
	color: "fg.default",
	textDecoration: "underline",
	cursor: "pointer",
})

export function ProfileHeader({ user, viewerId, share }: Props) {
	const isViewer = viewerId === user.id
	const hasActions = isViewer || Boolean(share)
	return (
		// The actions drop to their own row on a phone, where three share
		// icons and Edit beside the avatar would leave the name no room.
		<div
			className={css({
				display: "flex",
				flexDirection: { base: "column", sm: "row" },
				alignItems: { base: "stretch", sm: "center" },
				gap: { base: "3", sm: "4" },
			})}
		>
			{/* On a phone the teams take their own full-width row under the
			    avatar and name, rather than squeezing into the column beside
			    the avatar. From sm up they sit in that column, under the name. */}
			<div
				className={css({
					display: "grid",
					gridTemplateColumns: "auto minmax(0, 1fr)",
					gridTemplateAreas: {
						base: '"avatar info" "teams teams"',
						sm: '"avatar info" "avatar teams"',
					},
					columnGap: "4",
					alignItems: "start",
					flex: "1",
					minWidth: "0",
				})}
			>
				<div className={css({ gridArea: "avatar" })}>
					{isViewer ? (
						<EditableAvatar
							name={user.name}
							avatarUrl={user.avatarUrl ?? null}
						/>
					) : (
						<Avatar size="lg" name={user.name} src={user.avatarUrl} />
					)}
				</div>
				<VStack gap="0.5" alignItems="flex-start" minWidth="0" gridArea="info">
					{/* The flair wraps under the name on a phone instead of
					    truncating beside it and pushing the name onto two lines. */}
					<HStack
						gap="2"
						rowGap="1"
						alignItems="center"
						flexWrap={{ base: "wrap", sm: "nowrap" }}
						minWidth="0"
						maxWidth="full"
					>
						<span className={css({ fontFamily: "heading", fontSize: "xl" })}>
							{user.name}
						</span>
						{user.flair && <Flair flair={user.flair} size="sm" />}
					</HStack>
					<span
						className={css({
							textStyle: "metaLg",
							color: "fg.subtle",
						})}
					>
						@{user.username}
					</span>
					<span
						className={css({
							textStyle: "meta",
							color: "fg.subtle",
						})}
					>
						Member since {DateTime.fromISO(user.createdAt).toFormat("MMM yyyy")}
					</span>
				</VStack>
				{/* Someone else's empty list renders nothing. Your own gets the
				    prompt to fill it, since this is where you'd notice it's
				    missing. */}
				{(user.favoriteTeams.length > 0 || isViewer) && (
					<HStack
						gap="3"
						alignItems="center"
						flexWrap="wrap"
						minWidth="0"
						gridArea="teams"
						marginTop={{ base: "3", sm: "2" }}
					>
						{user.favoriteTeams.length > 0 && (
							<FavoriteTeamsRow teams={user.favoriteTeams} />
						)}
						{isViewer && (
							<button
								type="button"
								className={teamsEditButton}
								onClick={() =>
									openModal(
										<FavoriteTeamsPickerModal
											initialTeamIds={user.favoriteTeams.map((team) => team.id)}
										/>,
									)
								}
							>
								{user.favoriteTeams.length > 0
									? "Edit teams"
									: "Add your teams"}
							</button>
						)}
					</HStack>
				)}
			</div>
			{hasActions && (
				<HStack gap="2" alignItems="center" flexShrink="0">
					{share}
					{isViewer && (
						<Button
							variant="outline"
							size="sm"
							onClick={() =>
								openModal(<EditNameModal currentName={user.name} />)
							}
						>
							Edit
						</Button>
					)}
				</HStack>
			)}
		</div>
	)
}
