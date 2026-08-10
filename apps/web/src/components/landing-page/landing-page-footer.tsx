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
					<Brand size="sm" className={css({ opacity: 0.6 })} />
				</Link>
				<div
					className={css({
						display: { base: "none", lg: "flex" },
						gap: "6",
						fontSize: "xs",
						color: "fg.subtle",
					})}
				>
					<Link to="/" hash="how-it-works">
						How It Works
					</Link>
					<Link to="/" hash="question-types">
						Question Types
					</Link>
					<Link to="/" hash="leaderboard">
						Leaderboard
					</Link>
				</div>
				<div
					className={css({
						fontFamily: "mono",
						fontSize: "xs",
						color: "fg.subtle",
					})}
				>
					© {new Date().getFullYear()} Called My Shot
				</div>
			</LandingPageWrap>
		</footer>
	)
}
