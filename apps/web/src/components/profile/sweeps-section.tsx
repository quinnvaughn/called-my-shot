import { Link } from "@tanstack/react-router"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { Card } from "#/components/ui/card"
import { Tag } from "#/components/ui/tag"
import { formatCallDate } from "#/lib/format-date"

export type SweepRow = {
	league: { id: string; abbreviation: string; slug: string }
	slateKey: string
	slateLabel: string
	gameCount: number
	firstStartsAt: string
}

type Props = {
	username: string
	// Newest first, as User.sweeps returns them.
	sweeps: SweepRow[]
	// Off when the profile is scoped to one league, where it goes without saying.
	showLeague?: boolean
}

// One row per swept slate, each linking to its sweep page.
export function SweepsSection({ username, sweeps, showLeague = true }: Props) {
	return (
		<VStack alignItems="stretch" gap="2">
			{sweeps.map((sweep) => (
				<Link
					key={`${sweep.league.id}-${sweep.slateKey}`}
					to="/user/$username/sweeps/$league/$slateKey"
					params={{
						username,
						league: sweep.league.slug,
						slateKey: sweep.slateKey,
					}}
					className={css({
						display: "block",
						textDecoration: "none",
						color: "inherit",
					})}
				>
					<Card size="sm" interactive>
						<Card.Body>
							<HStack justify="space-between" alignItems="center" gap="3">
								<VStack gap="0.5" alignItems="flex-start" minWidth="0">
									<HStack gap="2" alignItems="center">
										{showLeague && (
											<Tag size="sm">{sweep.league.abbreviation}</Tag>
										)}
										<span
											className={css({
												fontSize: "sm",
												fontWeight: "semibold",
											})}
										>
											{sweep.slateLabel}
										</span>
									</HStack>
									<span
										className={css({
											fontFamily: "mono",
											fontSize: "2xs",
											color: "fg.subtle",
										})}
									>
										{formatCallDate(sweep.firstStartsAt)}
									</span>
								</VStack>
								<span
									className={css({
										fontFamily: "heading",
										fontSize: "lg",
										color: "fg.default",
										flexShrink: "0",
									})}
								>
									{sweep.gameCount} for {sweep.gameCount}
								</span>
							</HStack>
						</Card.Body>
					</Card>
				</Link>
			))}
		</VStack>
	)
}
