import { rankResultHeadline } from "@called-my-shot/schemas"
import { useMemo } from "react"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import {
	seasonGuessCount,
	seasonResultHeadline,
	seasonSquares,
} from "#/components/arcade/name-that-season/season-result"
import { Card } from "#/components/ui/card"
import { GroupLogo } from "#/components/ui/group-logo"
import { SignedPoints } from "#/components/ui/signed-points"
import { Tag } from "#/components/ui/tag"
import {
	buildDemo,
	DEMO_MATCHUP,
	LANDING_CAST,
} from "../group-call-demo/demo-fixture"
import { DemoPresser } from "../group-call-demo/demo-presser"
import { GROUP_DAY_RANK, GROUP_DAY_SEASON } from "./group-day-fixture"
import { GroupDayMemberRow } from "./group-day-member-row"
import { GroupDayPanel } from "./group-day-panel"

// A made-up group's day, for the landing page's hero: today's board for each
// arcade game, a call on last night's game, and a groupmate's presser
// question about it. Built from the app's own pieces and not interactive.
export function GroupDayDemo() {
	const demo = useMemo(() => buildDemo(LANDING_CAST), [])
	const pick = demo.sides.find((s) => s.isPick)
	const other = demo.sides.find((s) => !s.isPick)
	const against = other?.groupmates.length ?? 0

	return (
		<figure
			aria-label={`Example: a group's day. Three groupmates' Name That Season and Blind Rank results, a call on ${DEMO_MATCHUP} that lands for ${demo.points} points, and a groupmate asking about it in your presser.`}
		>
			<Card>
				<Card.Body>
					<div inert aria-hidden>
						<VStack gap="4" alignItems="stretch">
							<HStack gap="3">
								<GroupLogo name={LANDING_CAST.groupName} size="sm" />
								<VStack gap="0" alignItems="flex-start" flex="1">
									<span
										className={css({ fontSize: "sm", fontWeight: "semibold" })}
									>
										{LANDING_CAST.groupName}
									</span>
									<span
										className={css({ textStyle: "meta", color: "fg.subtle" })}
									>
										{LANDING_CAST.groupMeta}
									</span>
								</VStack>
								<Tag size="sm" variant="neutral">
									Today
								</Tag>
							</HStack>

							<GroupDayPanel title="Name That Season" swatch="season">
								<VStack gap="0.5" alignItems="stretch">
									{GROUP_DAY_SEASON.map((row) => (
										<GroupDayMemberRow
											key={row.name}
											name={row.name}
											isYou={row.isYou}
											squares={seasonSquares(row.outcomes)}
											result={seasonResultHeadline(
												seasonGuessCount(row.outcomes),
											)}
										/>
									))}
								</VStack>
							</GroupDayPanel>

							<GroupDayPanel title="Blind Rank" swatch="rank">
								<VStack gap="0.5" alignItems="stretch">
									{GROUP_DAY_RANK.map((row) => (
										<GroupDayMemberRow
											key={row.name}
											name={row.name}
											isYou={row.isYou}
											squares={row.slots.map((right) =>
												right ? "hit" : "miss",
											)}
											result={rankResultHeadline(
												row.slots.filter(Boolean).length,
											)}
										/>
									))}
								</VStack>
							</GroupDayPanel>

							<div
								className={css({
									display: "grid",
									gridTemplateColumns: { base: "1fr", sm: "1fr 1fr" },
									gap: "3",
								})}
							>
								<GroupDayPanel title="Call">
									<span
										className={css({ textStyle: "meta", color: "fg.subtle" })}
									>
										{DEMO_MATCHUP} · Final {pick?.final}-{other?.final}
									</span>
									<p
										className={css({
											fontSize: "sm",
											lineHeight: "snug",
											color: "fg.body",
										})}
									>
										Called it. You and {demo.ally} took the {pick?.label} over{" "}
										{against} of your group.
									</p>
									<HStack>
										<SignedPoints value={demo.points} suffix=" pts" pill />
									</HStack>
								</GroupDayPanel>
								<div
									className={css({
										backgroundColor: "bg.subtle",
										borderRadius: "md",
										padding: "3",
									})}
								>
									<DemoPresser {...demo.presser} />
								</div>
							</div>
						</VStack>
					</div>
				</Card.Body>
			</Card>
		</figure>
	)
}
