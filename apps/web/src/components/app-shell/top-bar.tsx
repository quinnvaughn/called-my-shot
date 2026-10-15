import { Link } from "@tanstack/react-router"
import { FiBell, FiMenu, FiPlus } from "react-icons/fi"
import { css, cx } from "styled-system/css"
import { HStack } from "styled-system/jsx"
import { AuthModal } from "#/components/auth/auth-modal"
import { Brand } from "#/components/ui/brand"
import { Button, button } from "#/components/ui/button"
import { openModal } from "#/stores/modal-store"
import { AccountMenu } from "./account-menu"
import type { Me } from "./types"
import { unreadBadge, unreadLabel } from "./unread-badge"

// h 16 is load-bearing: the sidebar and the right rail stick just under it
// (see sidebar-nav.tsx and app-shell.tsx).
export function TopBar({
	me,
	unreadCount,
	onMenuClick,
}: {
	me: Me
	unreadCount: number
	onMenuClick: () => void
}) {
	return (
		<div
			className={css({
				position: "sticky",
				top: 0,
				zIndex: "20",
				bg: "bg.canvas",
				borderBottom: "1px solid {colors.border.default}",
				// The status bar draws over the top of the Home Screen app.
				paddingTop: "env(safe-area-inset-top)",
			})}
		>
			<div
				className={css({
					display: "flex",
					alignItems: "center",
					justifyContent: "space-between",
					gap: "3",
					height: "16",
					maxWidth: "1728px",
					marginInline: "auto",
					paddingInline: { base: "5", md: "7" },
				})}
			>
				<HStack gap="3">
					<button
						type="button"
						aria-label="Open menu"
						onClick={onMenuClick}
						className={css({
							display: { base: "flex", md: "none" },
							alignItems: "center",
							justifyContent: "center",
							width: "8",
							height: "8",
							borderRadius: "lg",
							color: "fg.default",
							cursor: "pointer",
							_hover: { bg: "fg.default/10" },
						})}
					>
						<FiMenu size={20} />
					</button>
					{/* Phones get the logo at the top of the drawer instead. */}
					<Link
						to="/home"
						aria-label="Home"
						className={css({ display: { base: "none", md: "block" } })}
					>
						<Brand size="nav" />
					</Link>
				</HStack>

				{me ? (
					<HStack gap="2">
						<Link
							to="/new-question"
							aria-label="New Question"
							className={cx(
								button({ variant: "dark", size: "sm" }),
								css({ paddingInline: { base: "2.5", md: "4.5" } }),
							)}
						>
							<FiPlus size={16} />
							<span
								className={css({ display: { base: "none", md: "inline" } })}
							>
								New Question
							</span>
						</Link>
						<Link
							to="/notifications"
							aria-label={
								unreadCount > 0
									? `Notifications, ${unreadCount} unread`
									: "Notifications"
							}
							activeProps={{
								className: css({ bg: "bg.subtle", color: "fg.default" }),
							}}
							className={css({
								position: "relative",
								display: "flex",
								alignItems: "center",
								justifyContent: "center",
								width: "9",
								height: "9",
								borderRadius: "full",
								color: "fg.subtle",
								_hover: { bg: "fg.default/10", color: "fg.default" },
							})}
						>
							<FiBell size={20} />
							{unreadCount > 0 && (
								<span
									aria-hidden
									className={cx(
										unreadBadge,
										css({
											position: "absolute",
											top: "-0.5",
											right: "-1.5",
											border: "2px solid {colors.bg.canvas}",
										}),
									)}
								>
									{unreadLabel(unreadCount)}
								</span>
							)}
						</Link>
						<AccountMenu
							name={me.name}
							username={me.username}
							avatarUrl={me.avatarUrl}
							variant="topbar"
							isAdmin={me.isAdmin}
						/>
					</HStack>
				) : (
					<HStack gap="2">
						<Button
							variant="outline"
							size="sm"
							onClick={() => openModal(<AuthModal defaultView="signin" />)}
						>
							Log in
						</Button>
						<Button
							variant="solid"
							size="sm"
							onClick={() => openModal(<AuthModal defaultView="signup" />)}
							className={css({ display: { base: "none", sm: "inline-flex" } })}
						>
							Sign up
						</Button>
					</HStack>
				)}
			</div>
		</div>
	)
}
