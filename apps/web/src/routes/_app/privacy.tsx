import { createFileRoute } from "@tanstack/react-router"
import { LegalB } from "#/components/legal/legal-b"
import { LegalDocument } from "#/components/legal/legal-document"
import { LegalList } from "#/components/legal/legal-list"
import { LegalP } from "#/components/legal/legal-p"
import { LegalSection } from "#/components/legal/legal-section"
import { SupportEmail } from "#/components/legal/support-email"
import { pageMeta } from "#/lib/meta"

export const Route = createFileRoute("/_app/privacy")({
	component: RouteComponent,
	head: () =>
		pageMeta({
			title: "Privacy Policy · Called My Shot",
			description:
				"What Called My Shot collects, how it's used, who it's shared with, and how to delete it.",
			path: "/privacy",
		}),
})

function RouteComponent() {
	return (
		<LegalDocument title="Privacy Policy" effectiveDate="September 30, 2026">
			<LegalSection heading="The short version">
				<LegalP>
					Called My Shot is a free sports prediction game. We collect what we
					need to run your account, score your calls, and email you about them.
					We don't sell your data and we don't show ads.
				</LegalP>
			</LegalSection>

			<LegalSection heading="What we collect">
				<LegalList>
					<li>
						<LegalB>Account details.</LegalB> Your name, username and email
						address. If you sign up with a password, we store only a one-way
						hash of it, never the password itself.
					</li>
					<li>
						<LegalB>Google sign-in.</LegalB> If you continue with Google, Google
						shares your name, email address and a Google account ID with us. We
						don't receive your Google password, contacts, or anything else in
						your Google account.
					</li>
					<li>
						<LegalB>What you do here.</LegalB> Your calls and their conviction,
						questions you create, groups you join, fades, redos, and your
						points, streaks and ranks.
					</li>
					<li>
						<LegalB>What you upload or send.</LegalB> Your avatar and banner
						images, and anything you write to us through the support form.
					</li>
					<li>
						<LegalB>Invites.</LegalB> When you sign up with someone's invite
						code, we record who invited you and the IP address you signed up
						from. The address is only there so a person can review signups that
						look like one person making accounts to farm invite rewards.
					</li>
					<li>
						<LegalB>Usage analytics.</LegalB> Pages you view and actions you
						take, like making a call or joining a group. Once you're signed in
						these are tied to your account, including your name, username and
						email. Our analytics provider also records your IP address and basic
						browser and device details.
					</li>
					<li>
						<LegalB>Email delivery.</LegalB> Whether mail we sent you bounced,
						so we can ask you to fix your address.
					</li>
				</LegalList>
			</LegalSection>

			<LegalSection heading="Cookies and local storage">
				<LegalList>
					<li>A session cookie that keeps you signed in, for up to 30 days.</li>
					<li>
						A short-lived cookie while you sign in with Google, which expires
						after 10 minutes.
					</li>
					<li>
						Storage in your browser for picks you made before creating an
						account, an invite code from a link you opened (kept for 30 days),
						and which sign-in method you used last.
					</li>
					<li>
						An identifier our analytics provider uses to group your visits
						together.
					</li>
				</LegalList>
				<LegalP>
					We don't use advertising or cross-site tracking cookies.
				</LegalP>
			</LegalSection>

			<LegalSection heading="How we use it">
				<LegalList>
					<li>
						To run the game: scoring calls, settling questions, and building
						leaderboards, streaks and profiles.
					</li>
					<li>
						To email you: account emails like verifying your address, results
						and notifications about your calls, game reminders you asked for,
						and occasional announcements. Every email that isn't about your
						account has an unsubscribe link.
					</li>
					<li>To answer you when you contact support.</li>
					<li>
						To keep the game fair, like spotting fake accounts, referral abuse
						and questions resolved in bad faith.
					</li>
					<li>To understand how the product is used and improve it.</li>
				</LegalList>
			</LegalSection>

			<LegalSection heading="What other people can see">
				<LegalP>
					Your name, username, avatar, banner and flair are public, along with
					your calls, the questions you create, and your points, streaks and
					ranks. They appear on your profile, on leaderboards, in groups, and in
					share images. Your email address is never shown to other users.
				</LegalP>
			</LegalSection>

			<LegalSection heading="Who we share it with">
				<LegalP>
					We share data only with the services that run Called My Shot for us,
					and only what each one needs:
				</LegalP>
				<LegalList>
					<li>Fly.io, which hosts the app and its database.</li>
					<li>Resend, which delivers our email.</li>
					<li>Cloudflare, which stores uploaded images.</li>
					<li>PostHog, which provides product analytics.</li>
					<li>Google, if you choose to sign in with it.</li>
				</LegalList>
				<LegalP>
					We may also disclose information if the law requires it. We don't sell
					your personal information to anyone.
				</LegalP>
			</LegalSection>

			<LegalSection heading="Google user data">
				<LegalP>
					We use the name, email address and account ID Google gives us only to
					create your account and sign you in. We don't use it for advertising
					and don't transfer it to anyone except as described above. Our use of
					information received from Google APIs adheres to the Google API
					Services User Data Policy, including the Limited Use requirements.
				</LegalP>
			</LegalSection>

			<LegalSection heading="Keeping and deleting your data">
				<LegalP>
					We keep your data while your account exists. You can delete your
					account from Settings at any time. That removes your account, your
					calls, your points and your ranks. Questions you created stay up
					without your name attached, since other people's calls depend on them.
				</LegalP>
				<LegalP>
					Analytics records held by PostHog aren't removed automatically when
					you delete your account. Email <SupportEmail /> and we'll delete them.
				</LegalP>
			</LegalSection>

			<LegalSection heading="Children">
				<LegalP>
					Called My Shot isn't meant for anyone under 13, and we don't knowingly
					collect data from children under 13. If you believe a child has made
					an account, email <SupportEmail /> and we'll delete it.
				</LegalP>
			</LegalSection>

			<LegalSection heading="Changes">
				<LegalP>
					If we change this policy, we'll update the date at the top. If a
					change affects how we use data you've already given us, we'll email
					you before it takes effect.
				</LegalP>
			</LegalSection>

			<LegalSection heading="Contact">
				<LegalP>
					Questions about your data, or a request to see or delete it: email{" "}
					<SupportEmail />.
				</LegalP>
			</LegalSection>
		</LegalDocument>
	)
}
