import { Link } from "@tanstack/react-router"
import { css } from "styled-system/css"
import { AuthModal } from "#/components/auth/auth-modal"
import { LandingPageWrap } from "#/components/landing-page/landing-page-wrap"
import { Brand } from "#/components/ui/brand"
import { Button } from "#/components/ui/button"
import { openModal } from "#/stores/modal-store"

// The signed-out invite page's only chrome: the brand and a way to sign in
// for someone who already has an account.
export function GroupInviteNav() {
	return (
		<nav
			className={css({
				borderBottom: "1px solid {colors.border.default}",
				paddingTop: "env(safe-area-inset-top)",
			})}
		>
			<LandingPageWrap
				className={css({
					height: "16",
					display: "flex",
					alignItems: "center",
					justifyContent: "space-between",
				})}
			>
				<Link to="/">
					<Brand />
				</Link>
				<Button
					size="md"
					variant="ghost"
					onClick={() => openModal(<AuthModal defaultView="signin" />)}
				>
					Sign in
				</Button>
			</LandingPageWrap>
		</nav>
	)
}
