import { css } from "styled-system/css"
import { LandingPageWrap } from "#/components/landing-page/landing-page-wrap"
import { Brand } from "#/components/ui/brand"

export function ReferralFooter() {
	return (
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
						textStyle: "metaLg",
						color: "fg.subtle",
					})}
				>
					© {new Date().getFullYear()} Called My Shot
				</span>
			</LandingPageWrap>
		</footer>
	)
}
