import { createFileRoute, Link } from "@tanstack/react-router"
import {
	FiActivity,
	FiAward,
	FiCheckCircle,
	FiEye,
	FiFlag,
	FiHelpCircle,
	FiList,
	FiLock,
	FiMessageSquare,
	FiTarget,
	FiTrendingUp,
	FiUserCheck,
	FiUsers,
} from "react-icons/fi"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { AuthModal } from "#/components/auth/auth-modal"
import { LandingPageFeatureSection } from "#/components/landing-page/landing-page-feature-section"
import { LandingPageFooter } from "#/components/landing-page/landing-page-footer"
import { LandingPageGetStartedSection } from "#/components/landing-page/landing-page-get-started-section"
import { LandingPageLeaderboardSection } from "#/components/landing-page/landing-page-leaderboard-section"
import { LandingPageMockCard } from "#/components/landing-page/landing-page-mock-card"
import { LandingPageNav } from "#/components/landing-page/landing-page-nav"
import { LandingPageWrap } from "#/components/landing-page/landing-page-wrap"
import { Badge } from "#/components/ui/badge"
import { Button, button } from "#/components/ui/button"
import { openModal } from "#/stores/modal-store"

export const Route = createFileRoute("/")({
	component: Home,
})

const howItWorksItems = [
	{
		icon: <FiFlag />,
		title: "Make your call",
		description:
			"Pick a side, set a line, or guess an exact number. Set your conviction — how much of the payout is actually riding on it.",
	},
	{
		icon: <FiTrendingUp />,
		title: "The field reacts",
		description:
			"Every call shifts the percentages live. Bold picks against the crowd are worth more — that's baked into the payout, not a bonus.",
	},
	{
		icon: <FiLock />,
		title: "It locks and resolves",
		description:
			"Locked to a named source the second it's created. No moving goalposts, no fine print — the same rule for everyone.",
	},
	{
		icon: <FiAward />,
		title: "Climb the board",
		description:
			"Right calls add points and accuracy. Wrong calls cost what you committed. Your standing is the whole point.",
	},
]

const questionTypeItems = [
	{
		icon: <FiList />,
		title: "Multiple Choice",
		description:
			"Pick from a field of named options. The less popular your pick, the more it pays if you're right.",
		example: "e.g. Who wins the 2027 NFL MVP?",
	},
	{
		icon: <FiActivity />,
		title: "Over / Under",
		description:
			"One line, two sides. Same contrarian scoring as multiple choice, just a coinflip's worth of options.",
		example: "e.g. Total goals — over or under 2.5?",
	},
	{
		icon: <FiTarget />,
		title: "Numeric Guess",
		description:
			"Call an exact number. A tolerance band decides if you're close enough; how close beats the field decides the payout.",
		example: "e.g. How many rebounds will Embiid grab?",
	},
]

const noHouseItems = [
	{
		icon: <FiUserCheck />,
		title: "We don't boot sharps",
		description:
			"Get good, stay good. There's no bankroll to protect from you, so being consistently right is the entire point, not a liability.",
	},
	{
		icon: <FiEye />,
		title: "Your accuracy is public",
		description:
			"Tracked and shown on every call you make, not buried. It's the actual reputation system, not a vanity number.",
	},
	{
		icon: <FiHelpCircle />,
		title: "Ask about anything",
		description:
			"No licensed line to set, no real-money market to manage — so any question the community wants to argue about can exist.",
	},
	{
		icon: <FiCheckCircle />,
		title: "Official, alongside everyone else's",
		description:
			"We post our own questions daily. Yours sit right next to them, scored the exact same way.",
	},
]

const communityItems = [
	{
		icon: <FiMessageSquare />,
		title: "Defend your take",
		description:
			"Every call can come with a real case — the reasoning behind it, out in the open. That's where the actual arguing happens, before anyone's proven right.",
	},
	{
		icon: <FiUsers />,
		title: "Run it with your group",
		description:
			"Invite-only leaderboards that run on the exact same real points — so you can settle who actually knows ball with the people you argue about it with anyway.",
	},
]

function Home() {
	return (
		<div>
			<LandingPageNav />
			<header className={css({ padding: "{spacing.16} 0 {spacing.20}" })}>
				<LandingPageWrap
					className={css({
						display: "grid",
						gridTemplateColumns: { base: "1fr", lg: "1fr 1fr" },
						gap: "10",
						alignItems: "center",
					})}
				>
					<div>
						<Badge dot>NFL · NBA · More sports coming</Badge>
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
									Anyone can talk a good game. Prove it.
								</h1>
								<p
									className={css({
										lineHeight: "relaxed",
										color: "fg.body",
										maxWidth: "lg",
									})}
								>
									Call your shot on real outcomes across every sport you follow,
									defend it in the comments, and run your own leaderboard
									against your group chat. Bold, correct calls score more than
									safe ones — that's the whole game.
								</p>
							</VStack>
							<VStack alignItems="flex-start" gap="7">
								<HStack gap="5" flexWrap="wrap">
									<Button
										variant="solid"
										size="lg"
										onClick={() =>
											openModal(<AuthModal defaultView="signup" />)
										}
									>
										Get started free
									</Button>
									<Link
										to="/"
										hash="how-it-works"
										className={button({ variant: "ghost" })}
									>
										See how scoring works ↓
									</Link>
								</HStack>
								<p
									className={css({
										color: "fg.subtle",
										fontFamily: "mono",
										fontSize: "xs",
									})}
								>
									free to play · takes 30 seconds · no card required
								</p>
							</VStack>
						</VStack>
					</div>
					<LandingPageMockCard />
				</LandingPageWrap>
			</header>
			<LandingPageFeatureSection
				id="how-it-works"
				alt
				eyebrow="How it works"
				title="Four steps, every question."
				description="Same loop whether you're picking a champion, a game total, or an exact stat line."
				items={howItWorksItems}
			/>
			<LandingPageFeatureSection
				id="question-types"
				eyebrow="Question types"
				title="Not every call works the same way."
				description="Picking a side is different from guessing an exact number — so the scoring is honest about that instead of pretending it's all one thing. We post official questions every day, but anyone can create their own about anything."
				items={questionTypeItems}
				columns={3}
			/>
			<LandingPageFeatureSection
				alt
				eyebrow="No house, different incentives"
				title="There's no line to protect, so we don't have to protect it from you."
				description="Sportsbooks quietly limit or ban people who get too good at winning. We built the opposite thing on purpose."
				items={noHouseItems}
			/>
			<LandingPageFeatureSection
				id="community"
				eyebrow="This is a social product"
				title="Being right is better with an audience."
				description="A leaderboard is just a number until people can see the reasoning behind it — and until you can put it up against people you actually know."
				items={communityItems}
				columns={2}
			/>
			<LandingPageLeaderboardSection />
			<LandingPageGetStartedSection />
			<LandingPageFooter />
		</div>
	)
}
