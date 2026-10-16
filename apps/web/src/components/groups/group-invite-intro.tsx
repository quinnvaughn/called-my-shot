import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { GroupHeader } from "#/components/groups/group-header"
import { Avatar } from "#/components/ui/avatar"
import { AvatarStack } from "#/components/ui/avatar-stack"
import { Button } from "#/components/ui/button"
import { Eyebrow } from "#/components/ui/eyebrow"
import { pluralize } from "#/lib/pluralize"
import { leaguesLabel } from "./group-invite/leagues-label"
import type { GroupPreview } from "./group-invite/types"

type Props = {
	preview: GroupPreview
	onJoin: () => void
	joining: boolean
}

// The top of the invite page for someone signed in, who already knows the
// app: who invited them, the group's header with a one-tap join, and who's in
// it.
export function GroupInviteIntro({ preview, onJoin, joining }: Props) {
	const inviter = preview.invitedBy.username !== "" ? preview.invitedBy : null

	return (
		<VStack gap="3" alignItems="stretch">
			{inviter ? (
				<HStack gap="2.5" alignItems="center">
					<Avatar name={inviter.name} src={inviter.avatarUrl} size="sm" />
					<Eyebrow variant="neutral">@{inviter.username} invited you</Eyebrow>
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
					{leaguesLabel(preview.trackedLeagues)}
				</p>
			</HStack>
		</VStack>
	)
}
