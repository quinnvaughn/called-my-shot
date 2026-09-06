import { Link } from "@tanstack/react-router"
import { DateTime } from "luxon"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { Card } from "#/components/ui/card"
import type { LeagueWindowType } from "#/graphql/generated/graphql"
import { gamesInWindowLabel } from "#/lib/game-status"

type Props = {
	league: {
		id: string
		name: string
		abbreviation: string
		slug: string
		windowType: LeagueWindowType
		currentWindowGameCount: number
		liveGameCount: number
		nextLockAt: string | null
		myOpenCallCount: number | null
	}
}

// One entry point per league - the primary way Home points you at where the
// real action is (especially on mobile, where this is most of what's above
// the fold). Deliberately not a feed row: it's a room to go into, not
// something to read here.
export function LeagueRoomCard({ league }: Props) {
	const live = league.liveGameCount > 0

	const state = gamesInWindowLabel(
		league.currentWindowGameCount,
		league.windowType,
	)

	const detail = live
		? `${league.liveGameCount} live now`
		: league.nextLockAt
			? `Next lock ${DateTime.fromISO(league.nextLockAt).toRelative()}`
			: "Nothing open right now"

	return (
		<Link to="/leagues/$leagueSlug" params={{ leagueSlug: league.slug }}>
			<Card interactive>
				<Card.Body>
					<VStack gap="3" alignItems="stretch">
						<HStack gap="2.5" alignItems="center">
							<span
								className={css({
									display: "flex",
									alignItems: "center",
									justifyContent: "center",
									width: "8",
									height: "8",
									flexShrink: 0,
									borderRadius: "lg",
									bg: "bg.subtle",
									border: "1px solid {colors.border.default}",
									fontFamily: "mono",
									fontSize: "3xs",
									fontWeight: "bold",
								})}
							>
								{league.abbreviation}
							</span>
							<span
								className={css({
									fontFamily: "mono",
									fontSize: "2xs",
									letterSpacing: "wide",
									fontWeight: "bold",
									color: "fg.subtle",
								})}
							>
								{league.name}
							</span>
						</HStack>
						<VStack gap="0.5" alignItems="flex-start">
							<HStack gap="1.5" alignItems="center">
								{live && (
									<span
										className={css({
											width: "1.5",
											height: "1.5",
											borderRadius: "full",
											bg: "success.default",
											flexShrink: 0,
										})}
									/>
								)}
								<span className={css({ fontSize: "sm", fontWeight: "medium" })}>
									{state}
								</span>
							</HStack>
							<span
								className={css({
									fontFamily: "mono",
									fontSize: "2xs",
									color: live ? "fg.default" : "fg.subtle",
								})}
							>
								{detail}
							</span>
						</VStack>
						{league.myOpenCallCount !== null && (
							<span
								className={css({
									fontFamily: "mono",
									fontSize: "2xs",
									color: "fg.subtle",
									paddingTop: "2",
									borderTop: "1px solid {colors.border.default}",
								})}
							>
								<b className={css({ color: "fg.default", fontWeight: "bold" })}>
									{league.myOpenCallCount}
								</b>{" "}
								of your calls open
							</span>
						)}
					</VStack>
				</Card.Body>
			</Card>
		</Link>
	)
}
