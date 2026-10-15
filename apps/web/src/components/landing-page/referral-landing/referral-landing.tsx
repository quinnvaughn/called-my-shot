import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import { LandingPageWrap } from "#/components/landing-page/landing-page-wrap"
import { CallCard } from "#/components/questions/call-card"
import { Brand } from "#/components/ui/brand"
import { Eyebrow } from "#/components/ui/eyebrow"
import { ReferralCta } from "./referral-cta"
import { ReferralFooter } from "./referral-footer"
import { ReferralIntro } from "./referral-intro"
import { ReferralRedoCard } from "./referral-redo-card"
import type { ReferralInviter } from "./types"

export function ReferralLanding({ inviter }: { inviter: ReferralInviter }) {
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

						<ReferralIntro inviter={inviter} />

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

						<ReferralRedoCard username={inviter.username} />

						<ReferralCta />
					</div>
				</LandingPageWrap>
			</section>

			{/* The landing page's footer, minus its links. */}
			<ReferralFooter />
		</div>
	)
}
