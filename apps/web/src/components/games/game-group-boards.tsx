import { Link } from "@tanstack/react-router"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { railHeadingClass } from "#/components/questions/question-set-rail"
import { Card } from "#/components/ui/card"
import { GroupLogo } from "#/components/ui/group-logo"

type Props = {
	gameId: string
	boards: {
		callerCount: number
		group: { id: string; name: string; logoUrl: string | null }
	}[]
}

// The viewer's groups with calls on this game, each opening that group's
// board of everyone's calls on it. Renders nothing when there are none.
export function GameGroupBoards({ gameId, boards }: Props) {
	if (boards.length === 0) return null
	return (
		<VStack gap="2" alignItems="stretch">
			<span className={railHeadingClass}>Your groups</span>
			<Card variant="surface">
				<VStack gap="0" alignItems="stretch" paddingBlock="1">
					{boards.map(({ group, callerCount }) => (
						<Link
							key={group.id}
							to="/groups/$groupId/games/$gameId"
							params={{ groupId: group.id, gameId }}
							className={css({
								display: "block",
								textDecoration: "none",
								color: "inherit",
								paddingInline: "4",
								paddingBlock: "2.5",
								_hover: { bg: "bg.subtle" },
							})}
						>
							<HStack justify="space-between" gap="3">
								<HStack gap="2.5" minWidth="0">
									<GroupLogo name={group.name} src={group.logoUrl} size="sm" />
									<span
										className={css({
											fontSize: "sm",
											fontWeight: "medium",
											minWidth: "0",
											overflow: "hidden",
											textOverflow: "ellipsis",
											whiteSpace: "nowrap",
										})}
									>
										{group.name}
									</span>
								</HStack>
								<span
									className={css({
										fontFamily: "mono",
										fontSize: "2xs",
										color: "fg.subtle",
										whiteSpace: "nowrap",
									})}
								>
									{callerCount} called →
								</span>
							</HStack>
						</Link>
					))}
				</VStack>
			</Card>
		</VStack>
	)
}
