import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute, redirect } from "@tanstack/react-router"
import { useEffect } from "react"
import { FaRegTimesCircle } from "react-icons/fa"
import { FiHelpCircle, FiLock, FiRotateCcw, FiZap } from "react-icons/fi"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { AuthModal } from "#/components/auth/auth-modal"
import { LandingPageFeatureSection } from "#/components/landing-page/landing-page-feature-section"
import { LandingPageWrap } from "#/components/landing-page/landing-page-wrap"
import { Badge } from "#/components/ui/badge"
import { Brand } from "#/components/ui/brand"
import { Button } from "#/components/ui/button"
import { InfoTip } from "#/components/ui/info-tip"
import { NotFound } from "#/components/ui/not-found"
import { referralPreviewQuery } from "#/graphql/queries/invite"
import { track } from "#/lib/analytics"
import { pageMeta } from "#/lib/meta"
import { openModal } from "#/stores/modal-store"
import { captureReferral } from "#/stores/referral-store"

// Where an invite link lands. Sits outside _app because the visitor has no
// account for the app shell to frame.
//
// Shaped like the top of the landing page, but with every link stripped out:
// the nav's leagues, the footer's pages, the sign-in escape hatch. Nobody
// arrives here cold - a friend sent them - so the page has one job and
// anything clickable that isn't the signup button is a way out of it.
export const Route = createFileRoute("/join/$code")({
	// An invite does nothing for an account that already exists, so there is
	// nothing to claim and no reason to pitch.
	//
	// /home specifically, matching where AuthModal sends a new account. This
	// runs again on the router invalidate that follows a signup, at which
	// point `me` is set - and redirecting somewhere the modal isn't already
	// navigating makes the two race and abort each other.
	beforeLoad: ({ context }) => {
		if (context.me) throw redirect({ to: "/home" })
	},
	loader: ({ context, params }) =>
		context.queryClient.query(referralPreviewQuery(params.code)),
	head: ({ loaderData }) => {
		const preview = loaderData?.referralPreview
		if (!preview) return {}

		return pageMeta({
			title: `${preview.inviter.name} invited you to Called My Shot`,
			description:
				"Call what happens in real games before they start. Sign up on this link and you both get a free redo.",
			path: "/",
		})
	},
	component: RouteComponent,
})

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

function RouteComponent() {
	const { code } = Route.useParams()
	const { data } = useSuspenseQuery(referralPreviewQuery(code))
	const preview = data.referralPreview

	// Stashed on mount rather than on the button, so the code survives someone
	// who opens the signup form, closes it, and comes back to it.
	useEffect(() => {
		if (preview) captureReferral(code, "invite_link")
		track("join_page_viewed", { codeValid: Boolean(preview) })
	}, [code, preview])

	if (!preview) {
		return (
			<NotFound
				icon={<FaRegTimesCircle size={24} />}
				eyebrowText="Invite"
				heading="This invite link doesn't work"
				subtitle="It may have been reset, or the link's just wrong. Ask whoever sent it for a fresh one."
				link={{ text: "Look around anyway", url: "/" }}
			/>
		)
	}

	return (
		<div>
			<section className={css({ paddingBlock: { base: "10", sm: "20" } })}>
				<LandingPageWrap>
					<VStack alignItems="flex-start" gap="8">
						<VStack alignItems="flex-start" gap="5">
							{/* The only branding on the page, so it runs large rather
						than sitting at nav scale - there is no nav for it to sit
						in. className overrides the recipe's height, which only
						offers nav-sized variants. */}
							<Brand
								className={css({
									height: { base: "10", lg: "16" },
									width: "auto",
								})}
							/>
							<Badge dot>{`Invited by @${preview.inviter.username}`}</Badge>
							<h1
								className={css({
									fontFamily: "heading",
									fontSize: { base: "3xl", lg: "5xl" },
									lineHeight: "tight",
									letterSpacing: "tight",
									maxWidth: "3xl",
								})}
							>
								{preview.inviter.name} thinks they call games better than you.
							</h1>
							<p
								className={css({
									lineHeight: "relaxed",
									color: "fg.body",
									maxWidth: "lg",
								})}
							>
								Make calls on games before they start. Every one lands on your
								public record, right or wrong. The leaderboard settles it.
							</p>
						</VStack>

						<VStack alignItems="flex-start" gap="3">
							<HStack gap="2" alignItems="center">
								<FiRotateCcw aria-hidden size={18} />
								<span
									className={css({ fontSize: "lg", fontWeight: "semibold" })}
								>
									A free redo when you sign up
								</span>
								<InfoTip
									label="redos"
									text="Changes one call after you've made it, any time before that question locks. One per question."
								/>
							</HStack>
							<Button
								variant="solid"
								size="lg"
								onClick={() => openModal(<AuthModal defaultView="signup" />)}
							>
								Claim it
							</Button>
							<p
								className={css({
									color: "fg.subtle",
									fontFamily: "mono",
									fontSize: "xs",
								})}
							>
								free · no money, ever · takes 30 seconds
							</p>
						</VStack>
					</VStack>
				</LandingPageWrap>
			</section>

			<LandingPageFeatureSection
				alt
				columns={3}
				eyebrow="Why play"
				title="Being right is more fun when it's on the record."
				description="Every call is timestamped, locked when the game starts, and scored against what the rest of the field said."
				items={whyItems}
			/>

			{/* The landing page's footer, minus its links. */}
			<footer
				className={css({
					borderTop: "1px solid {colors.border.default}",
					paddingBlock: "10",
				})}
			>
				<LandingPageWrap
					className={css({
						display: "flex",
						justifyContent: "space-between",
						alignItems: "center",
						flexWrap: "wrap",
						gap: "4",
					})}
				>
					<Brand size="nav" className={css({ opacity: 0.6 })} />
					<span
						className={css({
							fontFamily: "mono",
							fontSize: "xs",
							color: "fg.subtle",
						})}
					>
						© {new Date().getFullYear()} Called My Shot
					</span>
				</LandingPageWrap>
			</footer>
		</div>
	)
}
