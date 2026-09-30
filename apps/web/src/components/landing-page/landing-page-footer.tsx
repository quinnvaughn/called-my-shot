import { Link } from "@tanstack/react-router"
import { css } from "styled-system/css"
import { Brand } from "#/components/ui/brand"
import { LandingPageWrap } from "./landing-page-wrap"

export function LandingPageFooter() {
	return (
		<footer
			className={css({
				borderTop: "1px solid {colors.border.default}",
				padding: "{spacing.10} 0",
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
				<Link to="/">
					<Brand size="nav" className={css({ opacity: 0.6 })} />
				</Link>
				<div
					className={css({
						display: { base: "none", lg: "flex" },
						gap: "6",
						fontSize: "xs",
						color: "fg.subtle",
					})}
				>
					<Link to="/how-it-works">How It Works</Link>
					<Link to="/leaderboard">Leaderboard</Link>
				</div>
				{/* Always shown, unlike the page links: Google's sign-in review
				checks that the homepage links to the privacy policy. */}
				<div
					className={css({
						display: "flex",
						gap: "4",
						fontFamily: "mono",
						fontSize: "xs",
						color: "fg.subtle",
					})}
				>
					<Link to="/privacy">Privacy</Link>
					<Link to="/terms">Terms</Link>
					<span>© {new Date().getFullYear()} Called My Shot</span>
				</div>
			</LandingPageWrap>
		</footer>
	)
}
