import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute, Link, redirect } from "@tanstack/react-router"
import {
	FiAward,
	FiHelpCircle,
	FiLock,
	FiMessageCircle,
	FiMic,
	FiUsers,
	FiZap,
} from "react-icons/fi"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { AuthModal } from "#/components/auth/auth-modal"
import { GuestPicks } from "#/components/landing-page/guest-picks/guest-picks"
import { LandingPageFeatureSection } from "#/components/landing-page/landing-page-feature-section"
import { LandingPageFooter } from "#/components/landing-page/landing-page-footer"
import { LandingPageGetStartedSection } from "#/components/landing-page/landing-page-get-started-section"
import { LandingPageLeaderboardSection } from "#/components/landing-page/landing-page-leaderboard-section"
import { LandingPageNav } from "#/components/landing-page/landing-page-nav"
import { LandingPageSection } from "#/components/landing-page/landing-page-section"
import { LandingPageWrap } from "#/components/landing-page/landing-page-wrap"
import { Badge } from "#/components/ui/badge"
import { Button } from "#/components/ui/button"
import { Card } from "#/components/ui/card"
import { Eyebrow } from "#/components/ui/eyebrow"
import { LandingPageDocument } from "#/graphql/queries/landing-page"
import { gqlQueryOptions } from "#/graphql/query-options"
import { openModal } from "#/stores/modal-store"

const landingPageQuery = gqlQueryOptions(LandingPageDocument, {})

export const Route = createFileRoute("/")({
	beforeLoad: ({ context }) => {
		if (context.me) {
			throw redirect({ to: "/home" })
		}
	},
	loader: ({ context }) => context.queryClient.query(landingPageQuery),
	component: Home,
})

const whoItems = [
	{
		icon: <FiMessageCircle />,
		title: "Your group chat",
		description:
			"The takes are already flying. Start a group, drop the invite link in the chat, and the standings remember who said what.",
	},
	{
		icon: <FiAward />,
		title: "Your fantasy league",
		description:
			"Fantasy only scores the players you drafted. Run a group next to it so the league also settles who reads games right, including the weeks your roster is dead.",
	},
	{
		icon: <FiMic />,
		title: "Your audience",
		description:
			"Podcast, channel, newsletter, whatever you run. One invite link gives every follower a leaderboard to beat you on. Nobody puts money up, so it's a scoreboard, not a sportsbook.",
	},
	{
		icon: <FiUsers />,
		title: "Your community",
		description:
			"Discord server, subreddit, a stats group, whatever you're already in. Nobody has to run it. Post the invite link once and the board sorts out who in the room calls games right.",
	},
]

const whyItems = [
	{
		icon: <FiLock />,
		title: "Receipts, not vibes",
		description:
			"Every call locks when the game starts and can't be edited after. Your accuracy sits on your profile for anyone to check.",
	},
	{
		icon: <FiHelpCircle />,
		title: "Ask anything",
		description:
			"Post your own question and set your own line. If it has a public result somebody could check, anyone can call it.",
	},
	{
		icon: <FiZap />,
		title: "Call every game",
		description:
			"It's free, so you don't have to pick your spots. Call every game you have an opinion on.",
	},
]

// The caps come straight from packages/scoring: the contrarian multiplier tops
// out at 6x, the early multiplier at 2x for a game and 3x for a season-long
// question, and conviction scales both what a hit pays and what a miss costs.
const scoringItems = [
	{
		figure: "Up to 6x",
		title: "Against the crowd",
		description:
			"A hit pays more the less of the field ended up on your side. On a two-way question, the boost starts once your side is under 20%.",
	},
	{
		figure: "Up to 3x",
		title: "Calling early",
		description:
			"Calling ahead of the rest of the field pays up to 2x on a game. Calling a season-long question before the games get played pays up to 3x.",
	},
	{
		figure: "1 to 100",
		title: "Your conviction",
		description:
			"You set how much rides on each call. Higher pays more on a hit and costs more on a miss.",
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
						// and the try-it stack, so it has to read as a break
						// between two sections rather than the space between two
						// paragraphs. Side by side it's just the column gutter.
						gap: { base: "16", lg: "10" },
						// Both columns start at the top. Centring hung the copy
						// off the middle of whatever height the try-it card
						// happened to be, which moves the headline down the page
						// for no reason the reader can see.
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
									You already think you know more than your friends. Now prove
									it.
								</h1>
								<p
									className={css({
										lineHeight: "relaxed",
										color: "fg.body",
										maxWidth: "lg",
									})}
								>
									Make calls on real games for free, then put a leaderboard
									behind it for your group chat, your fantasy league, or your
									whole audience. Every call goes on your record, right or
									wrong.
								</p>
							</VStack>
							<VStack alignItems="flex-start" gap="3">
								<p
									className={css({
										color: "fg.subtle",
										fontFamily: "mono",
										fontSize: "xs",
									})}
								>
									free · no money, ever · takes 30 seconds
								</p>
								<HStack gap="3" flexWrap="wrap">
									<p className={css({ color: "fg.muted", fontSize: "sm" })}>
										Already have an account?
									</p>
									<Button
										variant="dark"
										size="md"
										onClick={() => openModal(<AuthModal defaultView="signin" />)}
									>
										Sign in
									</Button>
								</HStack>
							</VStack>
						</VStack>
					</div>
					<div id="make-calls" className={css({ scrollMarginTop: "24" })}>
						<GuestPicks questions={data.guestPicks} />
					</div>
				</LandingPageWrap>
			</header>
			<LandingPageFeatureSection
				id="who"
				eyebrow="Who it's for"
				title="Somebody in every group needs to be proven wrong."
				description="A group is a private leaderboard for people who already argue about this. Free to join, no money in it, so anyone you'd invite can actually play."
				items={whoItems}
			/>
			<LandingPageFeatureSection
				id="why"
				alt
				columns={3}
				eyebrow="Why play"
				title="Being right is more fun when it's on the record."
				description="Every call is timestamped, locked when the game starts, and scored against what the rest of the field said."
				items={whyItems}
			/>
			<LandingPageSection>
				<LandingPageWrap
					className={css({
						display: "grid",
						gridTemplateColumns: { base: "1fr", lg: "2fr 3fr" },
						gap: { base: "8", lg: "12" },
						alignItems: "center",
					})}
				>
					<VStack alignItems="flex-start" gap="4">
						<Eyebrow>How scoring works</Eyebrow>
						<h2
							className={css({
								fontFamily: "heading",
								fontSize: { base: "xl", lg: "2xl" },
								lineHeight: "snug",
							})}
						>
							Bold calls against the crowd score more. Misses cost what you
							committed.
						</h2>
						<Link
							to="/how-it-works"
							className={css({
								fontSize: "sm",
								fontWeight: "medium",
								color: "primary.default",
								_hover: { textDecoration: "underline" },
							})}
						>
							Read how scoring works →
						</Link>
					</VStack>
					<div
						className={css({
							display: "grid",
							gridTemplateColumns: { base: "1fr", md: "repeat(3, 1fr)" },
							gap: "4",
						})}
					>
						{scoringItems.map((item) => (
							<Card key={item.title}>
								<Card.Body>
									<VStack alignItems="flex-start" gap="2">
										<span
											className={css({
												fontFamily: "heading",
												fontSize: "2xl",
												color: "secondary.default",
											})}
										>
											{item.figure}
										</span>
										<span className={css({ fontWeight: "semibold" })}>
											{item.title}
										</span>
										<p
											className={css({
												fontSize: "sm",
												lineHeight: "relaxed",
												color: "fg.muted",
											})}
										>
											{item.description}
										</p>
									</VStack>
								</Card.Body>
							</Card>
						))}
					</div>
				</LandingPageWrap>
			</LandingPageSection>
			<LandingPageLeaderboardSection entries={data.leaderboard.items} />
			<LandingPageGetStartedSection />
			<LandingPageFooter />
		</div>
	)
}
