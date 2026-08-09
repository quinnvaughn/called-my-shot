import { Link } from "@tanstack/react-router"
import { css } from "styled-system/css"
import { HStack } from "styled-system/jsx"
import { AuthModal } from "#/components/auth/auth-modal"
import { openModal } from "#/stores/modal-store"
import { Brand } from "../ui/brand"
import { Button } from "../ui/button"

export function LandingPageNav() {
	return (
		<nav
			className={css({
				position: "sticky",
				top: 0,
				zIndex: 20,
				bg: "bg.surface/88",
				backdropFilter: "blur(10px)",
				borderBottom: "1px solid {colors.border.default}",
			})}
		>
			<div
				className={css({
					maxWidth: "6xl",
					mx: "auto",
					padding: "0 {spacing.8}",
					height: "16",
					display: "flex",
					alignItems: "center",
					justifyContent: "space-between",
				})}
			>
				<Link to="/">
					<Brand />
				</Link>
				<HStack
					gap="7"
					alignItems="flex-start"
					className={css({
						fontSize: "sm",
						color: "fg.muted",
						display: { base: "none", lg: "flex" },
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
				</HStack>
				<HStack alignItems="center" gap="4.5">
					<Button
						variant="ghost"
						onClick={() => openModal(<AuthModal defaultView="signin" />)}
					>
						Sign in
					</Button>
					<Button
						variant="solid"
						onClick={() => openModal(<AuthModal defaultView="signup" />)}
					>
						Get Started
					</Button>
				</HStack>
			</div>
		</nav>
	)
}
