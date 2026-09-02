import { createFileRoute, Link, redirect } from "@tanstack/react-router"
import {
	FaArrowsUpDown,
	FaHashtag,
	FaToggleOn,
	FaTrophy,
	FaUserGroup,
} from "react-icons/fa6"
import {
	FiAward,
	FiCheckCircle,
	FiEye,
	FiFlag,
	FiHelpCircle,
	FiLock,
	FiMessageSquare,
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
import { LandingPageOpenQuestionsSection } from "#/components/landing-page/landing-page-open-questions-section"
import { LandingPageWrap } from "#/components/landing-page/landing-page-wrap"
import { Badge } from "#/components/ui/badge"
import { Button, button } from "#/components/ui/button"
import { LandingPageDocument } from "#/graphql/queries/landing-page"
import { openModal } from "#/stores/modal-store"

export const Route = createFileRoute("/")({
	beforeLoad: ({ context }) => {
		if (context.me) {
			throw redirect({ to: "/home" })
		}
	},
	loader: async ({ context }) => {
		const { data } = await context.apolloClient.query({
			query: LandingPageDocument,
		})
		return {
			leagues: data?.leagues ?? [],
			questions: data?.questions.items ?? [],
			leaderboardEntries: data?.leaderboard.items ?? [],
		}
	},
	component: Home,
})

const howItWorksItems = [
	{
		icon: <FiFlag />,
		title: "Make your call",
		description:
			"Pick a side, set a number, or guess an exact number. Set your conviction: how many points are actually riding on it.",
	},
	{
		icon: <FiTrendingUp />,
		title: "The field reacts",
		description:
			"Every call shifts the percentages live. Bold picks against the crowd are worth more: that's baked into the scoring, not a bonus.",
	},
	{
		icon: <FiLock />,
		title: "It locks and resolves",
		description:
			"Locked to a named source the second it's created. No moving goalposts, no fine print: the same rule for everyone.",
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
		icon: <FaArrowsUpDown />,
		title: "Stat lines",
		description:
			"Set a number on a player or team stat: over or under, your call.",
		example: "e.g. Will Embiid grab over/under 10.5 rebounds?",
	},
	{
		icon: <FaHashtag />,
		title: "Exact guesses",
		description:
			"Call an exact number for one game. A tolerance band decides if you're close enough; how close beats the field decides your score.",
		example: "e.g. How many passing yards will Mahomes throw for?",
	},
	{
		icon: <FaUserGroup />,
		title: "Head-to-head",
		description:
			"Two named players or teams, one stat or one outcome. Straight up.",
		example: "e.g. Who has more rebounds: Jokic or Embiid?",
	},
	{
		icon: <FaToggleOn />,
		title: "Yes / No",
		description:
			"A clean binary call on anything: a stat, an event, a transaction.",
		example: "e.g. Will there be a triple-double tonight?",
	},
	{
		icon: <FaTrophy />,
		title: "Season-long awards",
		description:
			"MVP, a championship, an All-league team: decided at season's end, so calling it early is worth more.",
		example: "e.g. Who will win NFL MVP this season?",
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
		title: "Anyone can create one",
		description:
			"Pick a shape, fill in the real players, teams, and stats, and it's live: no license to chase, no real-money market to manage, no approval to wait on.",
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
			"Every call can come with a real case: the reasoning behind it, out in the open. That's where the actual arguing happens, before anyone's proven right.",
	},
	{
		icon: <FiUsers />,
		title: "Run it with your group",
		description:
			"Invite-only leaderboards that run on the exact same real points: so you can settle who actually knows ball with the people you argue about it with anyway.",
	},
]

function Home() {
	const { leagues, questions, leaderboardEntries } = Route.useLoaderData()

	return (
		<div>
			<LandingPageNav leagues={leagues} />
			<header className={css({ paddingBlock: { base: "8", sm: "16" } })}>
				<LandingPageWrap
					className={css({
						display: "grid",
						gridTemplateColumns: { base: "1fr", lg: "1fr 1fr" },
						gap: "10",
						alignItems: "center",
					})}
				>
					<div>
						<Badge dot>NFL · NBA · MLB · More sports coming</Badge>
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
									Call your shot on real games and season awards across every
									sport you follow, defend it in the comments, and run your own
									leaderboard against your group chat. Bold, correct calls score
									more than safe ones: that's the whole game.
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
										className={button({ variant: "ghost", size: "md" })}
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
			<LandingPageOpenQuestionsSection questions={questions} />
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
				description="Picking a side is different from guessing an exact number: so the scoring is honest about that instead of pretending it's all one thing. We post official questions every day, but anyone can create their own the same way."
				items={questionTypeItems}
				columns={3}
			/>
			<LandingPageFeatureSection
				alt
				eyebrow="No house, different incentives"
				title="There's nothing to protect, so we don't have to protect it from you."
				description="Sportsbooks quietly limit or ban people who get too good at winning. We built the opposite thing on purpose."
				items={noHouseItems}
			/>
			<LandingPageFeatureSection
				id="community"
				eyebrow="This is a social product"
				title="Being right is better with an audience."
				description="A leaderboard is just a number until people can see the reasoning behind it: and until you can put it up against people you actually know."
				items={communityItems}
				columns={2}
			/>
			<LandingPageLeaderboardSection entries={leaderboardEntries} />
			<LandingPageGetStartedSection />
			<LandingPageFooter />
		</div>
	)
}
