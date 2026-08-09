import { createFileRoute, Link } from "@tanstack/react-router"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { LandingPageMockCard } from "#/components/landing-page/landing-page-mock-card"
import { LandingPageNav } from "#/components/landing-page/landing-page-nav"
import { LandingPageSection } from "#/components/landing-page/landing-page-section"
import { LandingPageWrap } from "#/components/landing-page/landing-page-wrap"
import { Button, button } from "#/components/ui/button"
import { Eyebrow } from "#/components/ui/eyebrow"

export const Route = createFileRoute("/")({
	component: Home,
})

function Home() {
	return (
		<div>
			<LandingPageNav />
			<header className={css({ padding: "{spacing.16} 0 {spacing.20}" })}>
				<LandingPageWrap
					className={css({
						display: "grid",
						gridTemplateColumns: { base: "1fr", lg: "1fr 1fr" },
						alignItems: "center",
					})}
				>
					<div>
						<Eyebrow dot>NFL · NBA · MORE SPORTS COMING</Eyebrow>
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
									<Button variant="solid" size="lg">
										GET STARTED FREE
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
			<LandingPageSection alt id="how-it-works">
				<LandingPageWrap>Hello poppit.</LandingPageWrap>
			</LandingPageSection>
		</div>
	)
}
