import { Link } from "@tanstack/react-router"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { Card } from "#/components/ui/card"
import { Identity } from "#/components/ui/identity"
import { formatSigned } from "#/lib/format-number"
import { toIdentity } from "#/lib/identity"
import type { Week } from "./types"

// One week: who won it, or why nobody did. A recapped week links to its
// recap's page.
export function WeekRow({ groupId, week }: { groupId: string; week: Week }) {
	const players = week.playersOfTheWeek
	const body = (
		<Card size="sm" interactive={week.recapped}>
			<Card.Body>
				<VStack alignItems="stretch" gap="2">
					<span
						className={css({
							textStyle: "label",
							color: "fg.muted",
						})}
					>
						{week.weekLabel}
					</span>
					{players.length === 0 ? (
						<span className={css({ fontSize: "sm", color: "fg.muted" })}>
							{week.recapped
								? "No Player of the Week. Nobody with 3 or more settled calls finished up on points."
								: "No recap. Fewer than 2 members had a call settle."}
						</span>
					) : (
						players.map((player, i) => (
							<HStack
								key={player.user?.id ?? `hidden-${i}`}
								justify="space-between"
								alignItems="center"
								gap="3"
							>
								{player.user ? (
									<Identity {...toIdentity(player.user)} />
								) : (
									<span className={css({ fontSize: "sm", color: "fg.muted" })}>
										Not shown on recaps
									</span>
								)}
								<VStack gap="0" alignItems="flex-end" flexShrink="0">
									<span
										className={css({
											fontFamily: "heading",
											fontSize: "xl",
											lineHeight: "1.1",
										})}
									>
										{formatSigned(player.points, { zeroSign: true })}
									</span>
									<span
										className={css({
											textStyle: "meta",
											color: "fg.muted",
											whiteSpace: "nowrap",
										})}
									>
										{player.wins}–{player.losses}
									</span>
								</VStack>
							</HStack>
						))
					)}
				</VStack>
			</Card.Body>
		</Card>
	)

	if (!week.shareToken) return body
	return (
		<Link
			to="/groups/$groupId/recaps/$token"
			params={{ groupId, token: week.shareToken }}
			className={css({
				display: "block",
				textDecoration: "none",
				color: "inherit",
			})}
		>
			{body}
		</Link>
	)
}
