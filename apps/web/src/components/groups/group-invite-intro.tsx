import type { ReactNode } from "react"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { GroupHeader } from "#/components/groups/group-header"
import { Avatar } from "#/components/ui/avatar"
import { AvatarStack } from "#/components/ui/avatar-stack"
import { Button } from "#/components/ui/button"
import { Eyebrow } from "#/components/ui/eyebrow"
import type { GroupPreviewQuery } from "#/graphql/generated/graphql"
import { pluralize } from "#/lib/pluralize"

type Props = {
	preview: NonNullable<GroupPreviewQuery["groupPreview"]>
	// Frames the invite around the person who sent it, with a line on what
	// the app is.
	pitchInviter: boolean
	onJoin: () => void
	joining: boolean
	freeNote: ReactNode
}

export function GroupInviteIntro({
	preview,
	pitchInviter,
	onJoin,
	joining,
	freeNote,
}: Props) {
	// An empty list means the group counts every league.
	const leaguesLabel =
		preview.trackedLeagues.length === 0
			? "all leagues"
			: preview.trackedLeagues
					.map((league) => league.abbreviation)
					.sort()
					.join(", ")

	return (
		<VStack gap="3" alignItems="stretch">
			{pitchInviter ? (
				<HStack gap="2.5" alignItems="center">
					<Avatar
						name={preview.invitedBy.name}
						src={preview.invitedBy.avatarUrl}
						size="sm"
					/>
					<Eyebrow variant="neutral">
						@{preview.invitedBy.username} invited you
					</Eyebrow>
				</HStack>
			) : (
				<Eyebrow variant="neutral">You've been invited to a group</Eyebrow>
			)}
			{/* The group page's own header, so joining lands on the shape
			the invite already showed. From lg up the button takes the
			header's action slot; below lg it's the pinned bar at the end
			of the page instead. */}
			<GroupHeader
				name={preview.name}
				logoUrl={preview.logoUrl}
				description={preview.description}
				links={[]}
				large
				actions={
					<VStack
						alignItems="stretch"
						gap="2"
						className={css({
							display: { base: "none", lg: "flex" },
							// The page's one job, so it stays the size it had as
							// its own row rather than shrinking to fit the slot.
							minWidth: "xs",
						})}
					>
						<Button
							variant="solid"
							size="lg"
							fullWidth
							onClick={onJoin}
							loading={joining}
						>
							Join {preview.name}
						</Button>
						{freeNote}
					</VStack>
				}
			/>
			<HStack gap="3" alignItems="center" flexWrap="wrap">
				<AvatarStack members={preview.members} />
				<p
					className={css({
						textStyle: "metaLg",
						color: "fg.muted",
					})}
				>
					{preview.memberCount} {pluralize(preview.memberCount, "member")} ·{" "}
					{leaguesLabel}
					{/* The eyebrow already names them when pitching. */}
					{!pitchInviter &&
						` · invited by ${preview.invitedBy.name} (@${preview.invitedBy.username})`}
				</p>
			</HStack>
			{pitchInviter && (
				<p
					className={css({
						maxWidth: "2xl",
						lineHeight: "relaxed",
						color: "fg.body",
					})}
				>
					Make calls on NFL, NBA, MLB and NHL games and whole seasons, or write
					your own questions for others to call. Every call is scored once the
					result is in, and {preview.name} ranks its members on its own
					leaderboard.
				</p>
			)}
		</VStack>
	)
}
