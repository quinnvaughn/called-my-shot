import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute, redirect } from "@tanstack/react-router"
import { useEffect } from "react"
import { FaRegTimesCircle } from "react-icons/fa"
import { FiRotateCcw } from "react-icons/fi"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { AuthModal } from "#/components/auth/auth-modal"
import { LandingPageWrap } from "#/components/landing-page/landing-page-wrap"
import { LeaderboardEntryCard } from "#/components/leaderboard/leaderboard"
import { CallCard } from "#/components/questions/call-card"
import { Brand } from "#/components/ui/brand"
import { Button } from "#/components/ui/button"
import { Eyebrow } from "#/components/ui/eyebrow"
import { NotFound } from "#/components/ui/not-found"
import { referralPreviewQuery } from "#/graphql/queries/invite"
import { track } from "#/lib/analytics"
import { toIdentity } from "#/lib/identity"
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

	const inviter = preview.inviter
	const identity = toIdentity(inviter)
	const stats = inviter.careerStats
	const lastCall = inviter.recentCalls[0]

	return (
		// Clipped so the CTA bar's full-bleed backdrop (100vw) can't push a
		// horizontal scrollbar onto the page.
		<div className={css({ overflowX: "clip" })}>
			<section className={css({ paddingBlock: { base: "10", sm: "20" } })}>
				<LandingPageWrap>
					{/* One column on a phone, in reading order. From lg up the call
					moves to its own column so everything else, the button
					included, fits above the fold. Grid areas rather than two
					renders, so the same elements just move. */}
					<div
						className={css({
							display: "grid",
							gridTemplateColumns: "minmax(0, 1fr)",
							gridTemplateAreas: `"brand" "intro" "call" "redo" "cta"`,
							gap: "10",
							maxWidth: "xl",
							marginInline: "auto",
							lg: {
								maxWidth: "5xl",
								gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
								gridTemplateAreas: `"brand call" "intro call" "redo call" "cta call"`,
								gridTemplateRows: "auto auto auto 1fr",
								columnGap: "16",
								rowGap: "8",
							},
						})}
					>
						{/* The only branding on the page, so it runs large rather
						than sitting at nav scale - there is no nav for it to sit
						in. className overrides the recipe's height, which only
						offers nav-sized variants. */}
						<Brand
							className={css({
								gridArea: "brand",
								height: { base: "10", lg: "16" },
								width: "auto",
								justifySelf: { base: "center", lg: "start" },
							})}
						/>

						<VStack
							alignItems="stretch"
							gap="5"
							className={css({ gridArea: "intro" })}
						>
							<LeaderboardEntryCard
								eyebrow="Overall rank"
								unrankedLabel="No resolved calls yet"
								entry={{
									rank: stats?.rank ?? null,
									totalPoints: stats?.totalPoints ?? 0,
									resolvedCallCount: stats?.resolvedCallCount ?? 0,
									accuracy: stats?.accuracy ?? null,
									user: identity,
								}}
							/>
							<h1
								className={css({
									fontFamily: "heading",
									fontSize: { base: "3xl", lg: "4xl" },
									lineHeight: "tight",
									letterSpacing: "tight",
								})}
							>
								@{inviter.username} invited you.
							</h1>
							<p className={css({ lineHeight: "relaxed", color: "fg.body" })}>
								Make calls on NFL, NBA, MLB and NHL games and whole seasons.
								Every call lands on your public record, scored against everyone
								else who called it.
							</p>
						</VStack>

						{lastCall && (
							<VStack
								alignItems="stretch"
								gap="3"
								className={css({
									gridArea: "call",
									lg: { alignSelf: "center" },
								})}
							>
								<Eyebrow variant="neutral">Their latest call</Eyebrow>
								<CallCard call={lastCall} linked={false} />
							</VStack>
						)}

						<VStack
							alignItems="stretch"
							gap="2"
							className={css({
								gridArea: "redo",
								border: "2px dashed {colors.fg.subtle}",
								borderRadius: "lg",
								padding: "5",
							})}
						>
							<HStack gap="2" alignItems="center">
								<FiRotateCcw aria-hidden size={18} />
								<h2 className={css({ fontSize: "lg", fontWeight: "semibold" })}>
									You both get a free redo
								</h2>
							</HStack>
							<p className={css({ lineHeight: "relaxed", color: "fg.body" })}>
								A redo changes one call after you've made it, any time before
								that question locks. Yours lands the moment you sign up.{" "}
								{`@${inviter.username}`} gets theirs when you make your first
								call.
							</p>
						</VStack>

						{/* Below lg the page is taller than a phone screen, so the
						button sticks to the bottom of the viewport until the page
						scrolls down to where it sits. The backdrop is a
						pseudo-element so it can run edge to edge while the button
						keeps the column's width. */}
						<VStack
							alignItems="stretch"
							gap="3"
							className={css({
								gridArea: "cta",
								position: "sticky",
								bottom: "0",
								zIndex: 10,
								paddingTop: "4",
								paddingBottom:
									"calc({spacing.4} + env(safe-area-inset-bottom))",
								_before: {
									content: '""',
									position: "absolute",
									insetBlock: "0",
									left: "50%",
									width: "100vw",
									transform: "translateX(-50%)",
									zIndex: -1,
									bg: "bg.canvas/92",
									backdropFilter: "blur(10px)",
									borderTop: "1px solid {colors.border.default}",
								},
								lg: {
									position: "static",
									alignSelf: "start",
									paddingBlock: "0",
									_before: { display: "none" },
								},
							})}
						>
							<Button
								variant="solid"
								size="lg"
								fullWidth
								onClick={() => openModal(<AuthModal defaultView="signup" />)}
							>
								Claim your redo
							</Button>
							<p
								className={css({
									color: "fg.subtle",
									fontFamily: "mono",
									fontSize: "xs",
									textAlign: "center",
								})}
							>
								free · no money, ever · takes 30 seconds
							</p>
						</VStack>
					</div>
				</LandingPageWrap>
			</section>

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
