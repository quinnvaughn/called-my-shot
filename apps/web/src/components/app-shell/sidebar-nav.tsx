import { Link } from "@tanstack/react-router"
import { BsBarChartFill } from "react-icons/bs"
import { FaSquareCheck, FaUser, FaUserGroup } from "react-icons/fa6"
import { FiBell, FiX } from "react-icons/fi"
import { GoHomeFill } from "react-icons/go"
import type { IconType } from "react-icons/lib"
import { css, cx } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { Brand } from "#/components/ui/brand"
import { button } from "#/components/ui/button"
import { MoreMenu } from "./more-menu"
import { SidebarFooter } from "./sidebar-footer"
import { SidebarLeagues } from "./sidebar-leagues"
import type { League, Me } from "./types"
import { unreadBadge, unreadLabel } from "./unread-badge"

type NavItem = {
	to: string
	label: string
	icon: IconType
	authRequired?: boolean
}
const NAV_ITEMS: NavItem[] = [
	{ to: "/home", label: "Home", icon: GoHomeFill },
	{
		to: "/notifications",
		label: "Notifications",
		icon: FiBell,
		authRequired: true,
	},
	{
		to: "/my-calls",
		label: "My Calls",
		icon: FaSquareCheck,
		authRequired: true,
	},
	{ to: "/leaderboard", label: "Leaderboard", icon: BsBarChartFill },
	{ to: "/groups", label: "Groups", icon: FaUserGroup, authRequired: true },
]

export function SidebarNav({
	me,
	unreadCount,
	leagues,
	drawerOpen,
	onNavigate,
}: {
	me: Me
	unreadCount: number
	leagues: League[]
	drawerOpen: boolean
	onNavigate: () => void
}) {
	const navItems: NavItem[] = [
		...NAV_ITEMS.filter((item) => me || !item.authRequired),
		...(me
			? [{ to: `/user/${me.username}`, label: "Profile", icon: FaUser }]
			: []),
	]
	return (
		<div
			className={css({
				width: "64",
				flexShrink: 0,
				display: "flex",
				flexDirection: "column",
				padding: "{spacing.6} {spacing.5}",
				borderRight: "1px solid {colors.border.default}",
				bg: "bg.canvas",
				position: { base: "fixed", md: "sticky" },
				top: 0,
				left: { base: 0, md: "auto" },
				height: "100dvh",
				overflowY: { base: "auto", md: "visible" },
				maxWidth: { base: "82vw", md: "none" },
				zIndex: { base: "50", md: "auto" },
				boxShadow: { base: "0 0 40px rgba(0, 0, 0, 0.4)", md: "none" },
				transform: {
					base: drawerOpen ? "translateX(0)" : "translateX(-100%)",
					md: "translateX(0)",
				},
				transition: "transform 0.22s ease",
			})}
		>
			<VStack alignItems="stretch" gap="8">
				<HStack justifyContent="space-between" paddingInline="1">
					<Brand size="nav" />
					<button
						type="button"
						aria-label="Close menu"
						onClick={onNavigate}
						className={css({
							display: { base: "flex", md: "none" },
							alignItems: "center",
							justifyContent: "center",
							width: "7",
							height: "7",
							borderRadius: "full",
							color: "fg.muted",
							cursor: "pointer",
							_hover: { bg: "fg.default/10", color: "fg.default" },
						})}
					>
						<FiX size={16} />
					</button>
				</HStack>

				<nav
					className={css({
						display: "flex",
						flexDirection: "column",
						gap: "1",
					})}
				>
					{navItems.map((item) => (
						<Link
							key={item.to}
							to={item.to}
							onClick={onNavigate}
							activeProps={{
								className: css({
									bg: "bg.subtle",
									color: "fg.default",
									fontWeight: "semibold",
								}),
							}}
							className={css({
								display: "flex",
								alignItems: "center",
								gap: "3.5",
								padding: "{spacing.2.5} {spacing.3}",
								borderRadius: "xl",
								fontSize: "sm",
								color: "fg.subtle",
								fontWeight: "medium",
								_hover: { bg: "fg.default/10", color: "fg.default" },
							})}
						>
							<item.icon size={20} />
							{item.label}
							{item.to === "/notifications" && unreadCount > 0 && (
								<span className={cx(unreadBadge, css({ marginLeft: "auto" }))}>
									{unreadLabel(unreadCount)}
								</span>
							)}
						</Link>
					))}
					<MoreMenu
						signedIn={!!me}
						isAdmin={me?.isAdmin ?? false}
						onNavigate={onNavigate}
					/>
					<SidebarLeagues leagues={leagues} onNavigate={onNavigate} />
					{me && (
						<HStack paddingTop="6" width="full">
							<Link
								to="/new-question"
								onClick={onNavigate}
								className={cx(
									css({ flex: 1 }),
									button({ variant: "dark", size: "sm" }),
								)}
							>
								+ New Question
							</Link>
						</HStack>
					)}
				</nav>
			</VStack>

			<SidebarFooter me={me} />
		</div>
	)
}
