import { Link } from "@tanstack/react-router"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { Card } from "#/components/ui/card"
import { type FragmentType, graphql, useFragment } from "#/graphql/generated"
import { Avatar, avatarStyle } from "../ui/avatar"
import { Eyebrow } from "../ui/eyebrow"

const MAX_VISIBLE_MEMBERS = 5

export const GroupCardFragment = graphql(`
	fragment GroupCard_group on Group {
		id
		name
		memberCount
		viewerRank
        members {
            id
            user {
                name
            }
        }
	}
`)

type GroupCardProps = {
	group: FragmentType<typeof GroupCardFragment>
}

export function GroupCard(props: GroupCardProps) {
	const group = useFragment(GroupCardFragment, props.group)

	return (
		<Link
			to="/groups/$groupId"
			params={{ groupId: group.id }}
			className={css({
				display: "block",
				textDecoration: "none",
				color: "inherit",
			})}
		>
			<Card size="md" interactive>
				<Card.Body>
					<VStack gap="3" alignItems="stretch">
						<HStack justify="space-between" alignItems="flex-start">
							<VStack gap="0.5" alignItems="flex-start">
								<span className={css({ fontWeight: "semibold" })}>
									{group.name}
								</span>
								<span
									className={css({
										fontSize: "xs",
										color: "fg.muted",
										fontFamily: "mono",
									})}
								>
									{group.memberCount}{" "}
									{group.memberCount === 1 ? "member" : "members"}
								</span>
							</VStack>
							<Eyebrow
								variant={group.viewerRank === 1 ? "secondary" : "primary"}
							>
								You're #{group.viewerRank}
							</Eyebrow>
						</HStack>
						<HStack gap="1">
							{group.members.slice(0, MAX_VISIBLE_MEMBERS).map((m) => (
								<Avatar size="xs" key={m.id} name={m.user.name} />
							))}
							{group.members.length > MAX_VISIBLE_MEMBERS && (
								<div className={avatarStyle({ size: "xs" })}>
									+{group.members.length - MAX_VISIBLE_MEMBERS}
								</div>
							)}
						</HStack>
					</VStack>
				</Card.Body>
			</Card>
		</Link>
	)
}
