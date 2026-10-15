import { Link } from "@tanstack/react-router"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { Avatar } from "#/components/ui/avatar"
import { Flair } from "#/components/ui/flair"
import { Table } from "#/components/ui/table"
import { crownLabel } from "#/lib/leaderboard"
import type { LeaderboardRowData } from "./leaderboard"

export function LeaderboardRow({
	item,
	viewerId,
}: {
	item: LeaderboardRowData
	viewerId?: string
}) {
	const isTop3 = item.rank !== null && item.rank <= 3
	return (
		<Table.Row active={item.user.id === viewerId}>
			<Table.Cell
				numeric
				className={css({
					color: isTop3 ? "primary.default" : "fg.subtle",
					fontWeight: isTop3 ? "bold" : "inherit",
					fontSize: "sm",
					fontFamily: "mono",
				})}
			>
				{item.rank}
			</Table.Cell>
			<Table.Cell>
				{/* Name and handle share the top line; the flair gets the second to
				itself. No "you" tag - the row is already highlighted for the viewer
				(Table.Row active, below), so the tag repeated what the row said and
				took width from the two things that name the person. */}
				<HStack gap="3" minWidth="0">
					<Avatar
						size="sm"
						name={item.user.name}
						src={item.user.avatarUrl}
						crown={crownLabel(item)}
					/>
					<VStack gap="0.5" alignItems="flex-start" minWidth="0" flex="1">
						<HStack gap="2" minWidth="0" maxWidth="full">
							<Link
								to={"/user/$username"}
								params={{ username: item.user.username }}
								className={css({
									minWidth: "0",
									truncate: true,
									fontSize: "sm",
									fontWeight: "medium",
									_hover: { textDecoration: "underline" },
								})}
							>
								{item.user.name}
							</Link>
							<span
								className={css({
									minWidth: "0",
									truncate: true,
									textStyle: "metaLg",
									color: "fg.muted",
								})}
							>
								@{item.user.username}
							</span>
						</HStack>
						{item.user.flair && <Flair flair={item.user.flair} />}
					</VStack>
				</HStack>
			</Table.Cell>
			<Table.Cell
				numeric
				className={css({ fontFamily: "mono", fontSize: "sm" })}
			>
				{item.totalPoints}
			</Table.Cell>
			<Table.Cell
				numeric
				className={css({ fontFamily: "mono", fontSize: "sm" })}
			>
				{item.resolvedCallCount}
			</Table.Cell>
			<Table.Cell
				numeric
				className={css({ fontFamily: "mono", fontSize: "sm" })}
			>
				{item.accuracy !== null ? `${Math.round(item.accuracy)}%` : "-"}
			</Table.Cell>
		</Table.Row>
	)
}
