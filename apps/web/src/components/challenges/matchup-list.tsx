import { Link } from "@tanstack/react-router"
import { FiChevronRight } from "react-icons/fi"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { Avatar } from "#/components/ui/avatar"
import { Tag } from "#/components/ui/tag"
import type { MatchupOutcome } from "#/graphql/generated/graphql"
import { signedPoints } from "#/lib/challenge"

export type MatchupSummary = {
	id: string
	creatorPoints: number
	acceptorPoints: number
	outcome: MatchupOutcome | null
	acceptor: {
		id: string
		username: string
		name: string
		avatarUrl: string | null
	}
}

// Who won a 1v1, named, so it reads the same whichever side is looking.
export function outcomeLabel(
	outcome: MatchupOutcome,
	creatorUsername: string,
	acceptorUsername: string,
): string {
	if (outcome === "DRAW") return "Draw"
	return `@${outcome === "CREATOR" ? creatorUsername : acceptorUsername} won`
}

// Who won a 1v1, told to one of the two people in it.
export function outcomeForSide(
	outcome: MatchupOutcome,
	side: "creator" | "acceptor",
): string {
	if (outcome === "DRAW") return "Draw"
	return (outcome === "CREATOR") === (side === "creator")
		? "You won"
		: "They won"
}

// The creator's 1v1s on their own challenge, each opening its
// question-by-question page. Told from the creator's side: "You won" or
// "You lost" rather than their own name. Each row shows only the other
// person's points, since the creator's are the same in every row and sit in
// the hero instead.
export function MatchupList({
	code,
	matchups,
}: {
	code: string
	matchups: MatchupSummary[]
}) {
	return (
		<VStack gap="0" alignItems="stretch">
			{matchups.map((m) => (
				<Link
					key={m.id}
					to="/challenges/$code/vs/$username"
					params={{ code, username: m.acceptor.username }}
					className={css({
						paddingBlock: "3",
						paddingInline: "2",
						marginInline: "-2",
						borderRadius: "md",
						borderBottom: "1px solid {colors.border.default}",
						_last: { borderBottom: "none" },
						_hover: { backgroundColor: "bg.subtle" },
					})}
				>
					<HStack justify="space-between" gap="3">
						<HStack gap="3" minWidth="0">
							<Avatar
								size="sm"
								name={m.acceptor.name}
								src={m.acceptor.avatarUrl}
							/>
							<VStack gap="0.5" alignItems="flex-start" minWidth="0">
								<HStack gap="2" minWidth="0" maxWidth="full">
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
										{m.acceptor.name}
									</span>
									<span
										className={css({
											fontFamily: "mono",
											fontSize: "xs",
											color: "fg.muted",
											flexShrink: "0",
										})}
									>
										@{m.acceptor.username}
									</span>
								</HStack>
								<span
									className={css({
										fontFamily: "mono",
										fontSize: "sm",
										fontWeight: "bold",
										color: "fg.default",
									})}
								>
									{signedPoints(m.acceptorPoints)} points
								</span>
							</VStack>
						</HStack>
						<HStack gap="3" flexShrink="0">
							{m.outcome ? (
								<Tag
									variant={
										m.outcome === "CREATOR"
											? "success"
											: m.outcome === "DRAW"
												? "neutral"
												: "danger"
									}
								>
									{m.outcome === "CREATOR"
										? "You won"
										: m.outcome === "DRAW"
											? "Draw"
											: "You lost"}
								</Tag>
							) : (
								<Tag>Playing</Tag>
							)}
							<FiChevronRight aria-hidden />
						</HStack>
					</HStack>
				</Link>
			))}
		</VStack>
	)
}
