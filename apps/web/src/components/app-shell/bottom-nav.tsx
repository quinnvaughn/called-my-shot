import { BsGrid3X3GapFill } from "react-icons/bs"
import { FiMenu, FiUser } from "react-icons/fi"
import { GoHomeFill } from "react-icons/go"
import { HiMiniSquares2X2 } from "react-icons/hi2"
import { css } from "styled-system/css"
import { AuthModal } from "#/components/auth/auth-modal"
import { openModal } from "#/stores/modal-store"
import { BottomNavItem } from "./bottom-nav-item"
import { MoreSheet } from "./more-sheet"
import type { Space } from "./space"
import type { Me } from "./types"

// The tab bar along the bottom of the screen, below md only, in place of the
// rail and side column. data-bottom-nav is what sets --bottom-nav-height in
// styles.css, which anything pinned to the bottom of the screen sits above.
export function BottomNav({ me, space }: { me: Me; space: Space }) {
	return (
		<nav
			aria-label="Main"
			data-bottom-nav
			className={css({
				display: { base: "grid", md: "none" },
				gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
				position: "fixed",
				left: 0,
				right: 0,
				bottom: 0,
				zIndex: "20",
				bg: "bg.canvas",
				borderTop: "1px solid {colors.border.default}",
				paddingInline: "2",
				paddingBottom: "env(safe-area-inset-bottom)",
			})}
		>
			<BottomNavItem
				to="/home"
				label="Home"
				icon={GoHomeFill}
				active={space.kind === "home"}
			/>
			<BottomNavItem
				to="/play"
				label="Play"
				icon={BsGrid3X3GapFill}
				active={space.kind === "play"}
			/>
			<BottomNavItem
				to="/spaces"
				label="Spaces"
				icon={HiMiniSquares2X2}
				active={
					space.kind === "spaces" ||
					space.kind === "league" ||
					space.kind === "group"
				}
			/>
			{me ? (
				<BottomNavItem
					to="/my-calls"
					label="You"
					icon={FiUser}
					active={space.kind === "you"}
				/>
			) : (
				<BottomNavItem
					label="You"
					icon={FiUser}
					onClick={() => openModal(<AuthModal defaultView="signup" />)}
				/>
			)}
			<BottomNavItem
				label="More"
				icon={FiMenu}
				onClick={() => openModal(<MoreSheet signedIn={!!me} />)}
			/>
		</nav>
	)
}
