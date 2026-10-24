import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute, redirect } from "@tanstack/react-router"
import { FiAward, FiMessageCircle, FiRadio, FiUsers } from "react-icons/fi"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { AuthModal } from "#/components/auth/auth-modal"
import { EveryWeekVisual } from "#/components/landing-page/every-week/every-week-visual"
import { GroupDayDemo } from "#/components/landing-page/group-day-demo/group-day-demo"
import { GuestPicks } from "#/components/landing-page/guest-picks/guest-picks"
import { LandingPageFeatureSection } from "#/components/landing-page/landing-page-feature-section"
import { LandingPageFooter } from "#/components/landing-page/landing-page-footer"
import { LandingPageGetStartedSection } from "#/components/landing-page/landing-page-get-started-section"
import { LandingPageNav } from "#/components/landing-page/landing-page-nav"
import { LandingPageSection } from "#/components/landing-page/landing-page-section"
import { LandingPageSectionHeader } from "#/components/landing-page/landing-page-section-header"
import { LandingPageWrap } from "#/components/landing-page/landing-page-wrap"
import { StartGroupForm } from "#/components/landing-page/start-group-form"
import { StartGroupModal } from "#/components/landing-page/start-group-modal"
import { LandingPageToday } from "#/components/landing-page/today/landing-page-today"
import { Badge } from "#/components/ui/badge"
import { Button, button } from "#/components/ui/button"
import { rankPuzzleTodayQuery } from "#/graphql/blind-rank/queries"
import { LandingPageDocument } from "#/graphql/landing-page/queries"
import { gqlQueryOptions } from "#/graphql/query-options"
import { seasonPuzzleTodayQuery } from "#/graphql/season-puzzles/queries"
import { openModal } from "#/stores/modal-store"

const landingPageQuery = gqlQueryOptions(LandingPageDocument, {})

export const Route = createFileRoute("/")({
	beforeLoad: ({ context }) => {
		if (context.me) {
			throw redirect({ to: "/home" })
		}
	},
	loader: ({ context }) =>
		Promise.all([
			context.queryClient.query(landingPageQuery),
			context.queryClient.query(seasonPuzzleTodayQuery),
			context.queryClient.query(rankPuzzleTodayQuery),
		]),
	component: Home,
})

const startOne = (
	<Button
		variant="outline"
		size="md"
		onClick={() => openModal(<StartGroupModal surface="landing_card" />)}
	>
		Start one
	</Button>
)

const whoItems = [
	{
		icon: <FiMessageCircle />,
		title: "Your group chat",
		action: startOne,
		description:
			"The takes are already flying. Start a group, drop the invite link in the chat, and the standings remember who said what.",
	},
	{
		icon: <FiAward />,
		title: "Your fantasy league",
		action: startOne,
		description:
			"Fantasy only scores the players you drafted. Run a group next to it and the league has a board to win every day, including the weeks your roster is dead.",
	},
	{
		icon: <FiRadio />,
		title: "Your audience",
		action: startOne,
		description:
			"Podcast, channel, newsletter, whatever you run. One invite link gives every follower a leaderboard to beat you on. Nobody puts money up, so it's a scoreboard, not a sportsbook.",
	},
	{
		icon: <FiUsers />,
		title: "Your community",
		action: startOne,
		description:
			"Discord server, subreddit, a stats group, whatever you're already in. Nobody has to run it. Post the invite link once and the boards sort out who in the room actually knows sports.",
	},
]

function Home() {
	const { data } = useSuspenseQuery(landingPageQuery)

	return (
		<div>
			<LandingPageNav leagues={data.leagues} />
			<header className={css({ paddingBlock: { base: "8", sm: "16" } })}>
				<LandingPageWrap
					className={css({
						display: "grid",
						gridTemplateColumns: { base: "1fr", lg: "1fr 1fr" },
						// Stacked, this gap is the only thing between the pitch
						// and the demo, so it has to read as a break between two
						// sections rather than the space between two paragraphs.
						// Side by side it's just the column gutter.
						gap: { base: "16", lg: "10" },
						// Both columns start at the top. Centring hung the copy
						// off the middle of whatever height the demo happened to
						// be, which moves the headline down the page for no
						// reason the reader can see.
						alignItems: "flex-start",
					})}
				>
					<div>
						<Badge dot>NFL · NBA · MLB · NHL · More sports coming</Badge>
						<VStack alignItems="flex-start" gap="8">
							<VStack alignItems="flex-start" gap="5">
								<h1
									className={css({
										fontFamily: "heading",
										fontSize: { base: "3xl", lg: "5xl" },
										lineHeight: "tight",
										letterSpacing: "tight",
									})}
								>
									Find out who in your group actually knows sports.
								</h1>
								<p
									className={css({
										lineHeight: "relaxed",
										color: "fg.body",
										maxWidth: "lg",
									})}
								>
									Start a group and send the link. Everyone plays the same daily
									sports puzzles and calls the same real games, and the group's
									boards keep score.
								</p>
							</VStack>
							<VStack alignItems="stretch" gap="3" width="full" maxWidth="lg">
								<StartGroupForm surface="landing_hero" />
								<p
									className={css({
										color: "fg.subtle",
										textStyle: "metaLg",
									})}
								>
									free · no money, ever
								</p>
							</VStack>
							<HStack gap="3" flexWrap="wrap">
								<p className={css({ color: "fg.muted", fontSize: "sm" })}>
									Or try it first, no account needed.
								</p>
								<a
									href="#today"
									className={button({ variant: "light", size: "md" })}
								>
									Play today's games
								</a>
							</HStack>
						</VStack>
					</div>
					<GroupDayDemo />
				</LandingPageWrap>
			</header>
			<LandingPageToday questions={data.guestPicks} />
			<LandingPageSection>
				<LandingPageWrap className={twoColumns}>
					<LandingPageSectionHeader
						eyebrow="With your group"
						title="Somebody wins the week. Somebody has to explain themselves."
						description="Your group gets a leaderboard for calls and a board for each arcade game, plus a Player of the Week and a record book for the best weeks and longest streaks. After each game, anyone in the group can ask about a call, and “No comment” counts as an answer. Want it one on one? Send a challenge and whoever scores more wins."
					/>
					<EveryWeekVisual />
				</LandingPageWrap>
			</LandingPageSection>
			<LandingPageSection alt id="calls">
				<LandingPageWrap className={twoColumns}>
					<VStack alignItems="flex-start" gap="6">
						<LandingPageSectionHeader
							eyebrow="Calls"
							title="Try a call on a real game."
							description="Every call goes on your record and the public leaderboard, group or not. Make one here and it's saved when you sign up."
						/>
						<Button
							variant="outline"
							size="lg"
							onClick={() => openModal(<AuthModal defaultView="signup" />)}
						>
							Sign up
						</Button>
					</VStack>
					<GuestPicks questions={data.guestPicks} />
				</LandingPageWrap>
			</LandingPageSection>
			<LandingPageFeatureSection
				id="who"
				eyebrow="Who it's for"
				title="Somebody in every group needs to be proven wrong."
				description="A group is a private leaderboard for people who already argue about this. Free to join, no money in it, so anyone you'd invite can actually play."
				items={whoItems}
			/>
			<LandingPageGetStartedSection />
			<LandingPageFooter />
		</div>
	)
}

const twoColumns = css({
	display: "grid",
	gridTemplateColumns: { base: "1fr", lg: "2fr 3fr" },
	gap: { base: "8", lg: "12" },
	alignItems: "flex-start",
	scrollMarginTop: "24",
})
