import { createFileRoute, Link } from "@tanstack/react-router"
import { css } from "styled-system/css"
import {
	LegalDocument,
	LegalList,
	LegalP,
	LegalSection,
	SupportEmail,
} from "#/components/legal/legal-document"
import { pageMeta } from "#/lib/meta"

export const Route = createFileRoute("/_app/terms")({
	component: RouteComponent,
	head: () =>
		pageMeta({
			title: "Terms of Service · Called My Shot",
			description:
				"The rules for using Called My Shot: accounts, calls, questions, points, and what's not allowed.",
			path: "/terms",
		}),
})

function RouteComponent() {
	return (
		<LegalDocument title="Terms of Service" effectiveDate="September 30, 2026">
			<LegalSection heading="Agreeing to these terms">
				<LegalP>
					By creating an account or using Called My Shot, you agree to these
					terms and to our{" "}
					<Link
						to="/privacy"
						className={css({
							color: "fg.default",
							textDecoration: "underline",
						})}
					>
						Privacy Policy
					</Link>
					. If you don't agree, don't use the service.
				</LegalP>
			</LegalSection>

			<LegalSection heading="No money, ever">
				<LegalP>
					Called My Shot is a free game. There are no deposits, no wagers and no
					payouts. Points, redos, streaks and ranks have no cash value and can't
					be bought, sold or traded. Nothing here is betting advice.
				</LegalP>
			</LegalSection>

			<LegalSection heading="Your account">
				<LegalList>
					<li>You must be at least 13 years old to make an account.</li>
					<li>
						One account per person. Give accurate information and keep your
						sign-in details to yourself. You're responsible for what happens on
						your account.
					</li>
					<li>
						Your username must not impersonate someone else or be offensive. We
						may change a username that breaks this rule.
					</li>
					<li>You can delete your account from Settings at any time.</li>
				</LegalList>
			</LegalSection>

			<LegalSection heading="Calls, questions and scoring">
				<LegalList>
					<li>
						Results come from third-party sports data, which can be late or
						wrong. When a result or a score turns out to be wrong, we may
						correct it and re-score the calls it affected.
					</li>
					<li>
						If you create a question that you resolve yourself, you have to
						resolve it honestly and on time. We may void a question that's
						misleading, unanswerable or resolved in bad faith, give its creator
						a strike, and turn off question creation for accounts that collect
						too many.
					</li>
					<li>
						Invite rewards are for inviting real people. We may withhold or
						remove rewards earned through fake or duplicate accounts.
					</li>
				</LegalList>
			</LegalSection>

			<LegalSection heading="What's not allowed">
				<LegalList>
					<li>
						Harassing, threatening or hateful content, including in names,
						questions and images.
					</li>
					<li>
						Anything illegal, or content you don't have the right to post.
					</li>
					<li>
						Using more than one account to farm rewards, manipulate leaderboards
						or fade yourself.
					</li>
					<li>
						Scraping, automated access, or anything that interferes with the
						service or other players.
					</li>
				</LegalList>
			</LegalSection>

			<LegalSection heading="Your content">
				<LegalP>
					You own what you post: your calls, questions, images and anything else
					you add. You give us permission to store it, display it and share it
					within Called My Shot, including on your profile, in groups and in
					share images, for as long as it's on the service.
				</LegalP>
			</LegalSection>

			<LegalSection heading="Suspension and removal">
				<LegalP>
					We may remove content, suspend features, or close accounts that break
					these terms. For anything other than clear abuse, we'll tell you what
					happened and why.
				</LegalP>
			</LegalSection>

			<LegalSection heading="Teams and leagues">
				<LegalP>
					Team, league and player names belong to their owners. Called My Shot
					isn't affiliated with or endorsed by any league, team or player.
				</LegalP>
			</LegalSection>

			<LegalSection heading="Disclaimers">
				<LegalP>
					Called My Shot is provided as is, without warranties of any kind. We
					don't promise it will always be available, error-free, or that results
					and scores will always be accurate. To the fullest extent the law
					allows, we aren't liable for indirect or consequential losses from
					using the service, and our total liability to you for any claim is
					limited to $50.
				</LegalP>
			</LegalSection>

			<LegalSection heading="Changes">
				<LegalP>
					We may update these terms. We'll change the date at the top, and for
					significant changes we'll email you before they take effect. Using
					Called My Shot after that means you accept the new terms.
				</LegalP>
			</LegalSection>

			<LegalSection heading="Contact">
				<LegalP>
					Questions about these terms: email <SupportEmail />.
				</LegalP>
			</LegalSection>
		</LegalDocument>
	)
}
