import { Link } from "@tanstack/react-router"
import type { ReactNode } from "react"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { Avatar } from "#/components/ui/avatar"
import { PlayerOrTeamImage } from "#/components/ui/player-or-team-image"
import { TeamBadge } from "#/components/ui/team-badge"
import { UserHandle } from "#/components/users/user-handle"
import { toCallSummary } from "#/lib/call-summary"
import { type ChainLinkData, chanceLabel, linkPick } from "#/lib/chains"
import { formatShortDate } from "#/lib/format-date"
import { toIdentity } from "#/lib/identity"

// Lifts an element above the row's stretched link so it stays clickable.
const aboveLink = css({ position: "relative", zIndex: 1 })

type Props = {
	link: ChainLinkData
	// Right side of the row: its status, or a request's buttons.
	trailing: ReactNode
}

// One link, compact: who, what they picked on which game, its chance, and
// how it stands. The whole row opens the call.
export function ChainLinkRow({ link, trailing }: Props) {
	const person = link.user ? toIdentity(link.user) : null
	const call = link.call
	const summary = call ? toCallSummary(call) : null
	const option = summary?.selections[0]?.option
	const game = link.game
	return (
		<HStack
			gap="3"
			alignItems="center"
			flexWrap={{ base: "wrap", md: "nowrap" }}
			className={css({
				position: "relative",
				flex: "1",
				minWidth: "0",
				paddingBlock: "3",
				paddingInline: "4",
				borderRadius: "lg",
				bg: "bg.surface",
				border: link.isBreaker
					? "1px solid {colors.danger.default}"
					: "1px solid {colors.border.default}",
				transition: "border-color 0.15s ease",
				_hover: link.isBreaker
					? {}
					: { border: "1px solid {colors.border.emphasized}" },
			})}
		>
			{call && (
				<Link
					to="/calls/$callId"
					params={{ callId: call.id }}
					aria-label={`@${person?.username ?? "someone"}'s call`}
					className={css({
						position: "absolute",
						inset: "0",
						borderRadius: "lg",
					})}
				/>
			)}
			<HStack
				gap="2.5"
				minWidth="0"
				flex={{ base: "1 1 100%", md: "0 0 auto" }}
			>
				<Avatar
					size="sm"
					name={person?.name ?? "Someone"}
					src={person?.avatarUrl ?? null}
				/>
				<span className={aboveLink}>
					{person ? <UserHandle user={person} /> : "@someone"}
				</span>
			</HStack>
			<VStack gap="1" alignItems="flex-start" minWidth="0" flex="1">
				<HStack gap="2" minWidth="0">
					{option && (
						<PlayerOrTeamImage player={option.player} team={option.team} />
					)}
					<span
						className={css({
							fontSize: "md",
							fontWeight: "semibold",
							overflow: "hidden",
							textOverflow: "ellipsis",
							whiteSpace: "nowrap",
						})}
					>
						{linkPick(link) ?? "A call"}
					</span>
				</HStack>
				{game && (
					<HStack
						gap="2"
						className={css({ textStyle: "meta", color: "fg.muted" })}
					>
						<TeamBadge
							abbreviation={game.awayTeam.abbreviation}
							color={game.awayTeam.color}
							logoUrl={game.awayTeam.logoUrl}
							showAbbreviation
						/>
						<span>@</span>
						<TeamBadge
							abbreviation={game.homeTeam.abbreviation}
							color={game.homeTeam.color}
							logoUrl={game.homeTeam.logoUrl}
							showAbbreviation
						/>
						<span>· {formatShortDate(game.startsAt)}</span>
						<span>· {chanceLabel(link.hitChance)}</span>
					</HStack>
				)}
			</VStack>
			<div className={aboveLink}>{trailing}</div>
		</HStack>
	)
}
