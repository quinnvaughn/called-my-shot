import { Link } from "@tanstack/react-router"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { AvatarStack } from "#/components/ui/avatar-stack"
import { Card } from "#/components/ui/card"
import { GroupLogo } from "#/components/ui/group-logo"
import { type FragmentType, graphql, useFragment } from "#/graphql/generated"
import { pluralize } from "#/lib/pluralize"
import { Eyebrow } from "../ui/eyebrow"

export const GroupCardFragment = graphql(`
	fragment GroupCard_group on Group {
		id
		name
		logoUrl
		memberCount
		viewerRank
        members {
            id
            user {
                name
                avatarUrl
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
							<HStack gap="3" alignItems="center" minWidth="0">
								<GroupLogo name={group.name} src={group.logoUrl} />
								<VStack gap="0.5" alignItems="flex-start" minWidth="0">
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
										{group.memberCount} {pluralize(group.memberCount, "member")}
									</span>
								</VStack>
							</HStack>
							{group.viewerRank !== null && (
								<Eyebrow variant={"primary"}>
									You're #{group.viewerRank}
								</Eyebrow>
							)}
						</HStack>
						<AvatarStack
							members={group.members.map((m) => ({
								id: m.id,
								name: m.user.name,
								avatarUrl: m.user.avatarUrl,
							}))}
						/>
					</VStack>
				</Card.Body>
			</Card>
		</Link>
	)
}
