import { Link } from "@tanstack/react-router"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { Card } from "#/components/ui/card"
import { Tag } from "#/components/ui/tag"
import {
	coldStreakText,
	type StreakFamilyValue,
	streakFamilyParam,
} from "#/lib/streak-meta"

export type ColdStreakRow = {
	league: { id: string; abbreviation: string; slug: string }
	family: StreakFamilyValue
	familyLabel: string
	currentColdLength: number
	worstColdLength: number
}

type Props = {
	username: string
	// Coldest first, as User.coldStreaks returns them.
	coldStreaks: ColdStreakRow[]
	// Off when the profile is scoped to one league, where it goes without saying.
	showLeague?: boolean
}

// The mirror of StreaksSection: one card per league-and-family track the user
// is currently missing on, each linking to that track's page, which leads
// with the cold streak while it's the live one. No nudge - there's nothing to
// chase on a cold run.
export function ColdStreaksSection({
	username,
	coldStreaks,
	showLeague = true,
}: Props) {
	return (
		<VStack alignItems="stretch" gap="2">
			{coldStreaks.map((streak) => (
				<Link
					key={`${streak.league.id}-${streak.family}`}
					to="/user/$username/streaks/$league/$family/$mode"
					params={{
						username,
						league: streak.league.slug,
						family: streakFamilyParam(streak.family),
						mode: "cold",
					}}
					className={css({
						display: "block",
						textDecoration: "none",
						color: "inherit",
					})}
				>
					<Card size="sm" interactive>
						<Card.Body>
							{/* Stacked on a phone the way a hot streak's card is: name,
							    run, worst. On one line the run's big text left the
							    name too narrow to fit beside it. */}
							<div
								className={css({
									display: "flex",
									flexDirection: { base: "column", sm: "row" },
									justifyContent: "space-between",
									alignItems: { base: "flex-start", sm: "center" },
									gap: { base: "1.5", sm: "3" },
								})}
							>
								<HStack gap="2" alignItems="center" minWidth="0">
									{showLeague && (
										<Tag size="sm">{streak.league.abbreviation}</Tag>
									)}
									<span
										className={css({ fontSize: "sm", fontWeight: "semibold" })}
									>
										{streak.familyLabel}
									</span>
								</HStack>
								<div
									className={css({
										display: "flex",
										flexDirection: { base: "column", sm: "row" },
										alignItems: { base: "flex-start", sm: "baseline" },
										gap: { base: "1.5", sm: "3" },
										flexShrink: "0",
									})}
								>
									<span
										className={css({ fontFamily: "heading", fontSize: "lg" })}
									>
										{coldStreakText(streak.currentColdLength)}
									</span>
									<span
										className={css({
											fontFamily: "mono",
											fontSize: "2xs",
											letterSpacing: "wide",
											textTransform: "uppercase",
											color: "fg.subtle",
										})}
									>
										Worst {streak.worstColdLength}
									</span>
								</div>
							</div>
						</Card.Body>
					</Card>
				</Link>
			))}
		</VStack>
	)
}
