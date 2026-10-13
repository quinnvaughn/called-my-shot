import { Link } from "@tanstack/react-router"
import { FiChevronRight } from "react-icons/fi"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { Identity } from "#/components/ui/identity"
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
// question-by-question page. Told from the creator's side: their points
// first, and "You won" rather than their own name.
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
						<Identity
							name={m.acceptor.name}
							username={m.acceptor.username}
							avatarUrl={m.acceptor.avatarUrl}
						/>
						<HStack gap="3" flexShrink="0">
							<span
								className={css({
									fontFamily: "mono",
									fontSize: "xs",
									color: "fg.muted",
								})}
							>
								You {signedPoints(m.creatorPoints)} · them{" "}
								{signedPoints(m.acceptorPoints)}
							</span>
							{m.outcome ? (
								<Tag
									size="sm"
									variant={m.outcome === "CREATOR" ? "success" : "neutral"}
								>
									{m.outcome === "CREATOR"
										? "You won"
										: m.outcome === "DRAW"
											? "Draw"
											: "They won"}
								</Tag>
							) : (
								<Tag size="sm">Playing</Tag>
							)}
							<FiChevronRight aria-hidden />
						</HStack>
					</HStack>
				</Link>
			))}
		</VStack>
	)
}
