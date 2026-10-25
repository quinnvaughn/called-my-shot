import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import { EveryWeekVisual } from "#/components/groups/every-week/every-week-visual"
import { LandingPageWrap } from "#/components/landing-page/landing-page-wrap"
import { Eyebrow } from "#/components/ui/eyebrow"

// What a group does besides calls, which the demo above it doesn't get to:
// the arcade boards, the recap, pressers, the record book and challenges.
export function GroupInviteWeek({ groupName }: { groupName: string }) {
	return (
		<section className={css({ paddingBottom: { base: "8", sm: "14" } })}>
			<LandingPageWrap
				className={css({
					display: "grid",
					gridTemplateColumns: { base: "1fr", lg: "1fr 1fr" },
					gap: { base: "10", lg: "10" },
					alignItems: "flex-start",
				})}
			>
				<VStack alignItems="flex-start" gap="3.5">
					<Eyebrow variant="neutral">Every week in {groupName}</Eyebrow>
					<h2
						className={css({
							fontFamily: "heading",
							fontSize: "3xl",
							lineHeight: "tight",
							letterSpacing: "tight",
							maxWidth: "xl",
						})}
					>
						Somebody wins the week. Somebody has to explain themselves.
					</h2>
					<p
						className={css({
							color: "fg.muted",
							lineHeight: "relaxed",
							maxWidth: "xl",
						})}
					>
						Your group gets a leaderboard for calls and a board for each arcade
						game, plus a Player of the Week and a record book for the best weeks
						and longest streaks. After each game, anyone in the group can ask
						about a call, and “No comment” counts as an answer. Want it one on
						one? Send a challenge and whoever scores more wins.
					</p>
				</VStack>
				<EveryWeekVisual />
			</LandingPageWrap>
		</section>
	)
}
