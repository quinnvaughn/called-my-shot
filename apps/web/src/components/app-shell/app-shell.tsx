import { Link, useRouteContext } from "@tanstack/react-router"
import { type ReactNode, useEffect, useState } from "react"
import { BsBarChartFill } from "react-icons/bs"
import { FaRegCheckSquare } from "react-icons/fa"
import { FaUser, FaUserGroup } from "react-icons/fa6"
import { FiMenu, FiX } from "react-icons/fi"
import { GoHomeFill } from "react-icons/go"
import type { IconType } from "react-icons/lib"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { AuthModal } from "#/components/auth/auth-modal"
import { Brand } from "#/components/ui/brand"
import { Button } from "#/components/ui/button"
import { openModal } from "#/stores/modal-store"
import { AccountMenu } from "./account-menu"

type NavItem = {
	to: string
	label: string
	icon: IconType
	authRequired?: boolean
}
const NAV_ITEMS: NavItem[] = [
	{ to: "/home", label: "Home", icon: GoHomeFill },
	{ to: "/leaderboard", label: "Leaderboard", icon: BsBarChartFill },
	{
		to: "/my-calls",
		label: "My Calls",
		icon: FaRegCheckSquare,
		authRequired: true,
	},
	{ to: "/groups", label: "Groups", icon: FaUserGroup, authRequired: true },
]

type Me = { name: string; username: string } | null

export function AppShell({ children }: { children: ReactNode }) {
	const { me: rawMe } = useRouteContext({ from: "__root__" })
	const me: Me = rawMe
		? { name: rawMe.name ?? "", username: rawMe.username ?? "" }
		: null
	const [drawerOpen, setDrawerOpen] = useState(false)

	useEffect(() => {
		if (!drawerOpen) return
		document.body.style.overflow = "hidden"
		function onKeyDown(event: KeyboardEvent) {
			if (event.key === "Escape") setDrawerOpen(false)
		}
		document.addEventListener("keydown", onKeyDown)
		return () => {
			document.body.style.overflow = ""
			document.removeEventListener("keydown", onKeyDown)
		}
	}, [drawerOpen])

	return (
		<div className={css({ minHeight: "100dvh", bg: "bg.canvas" })}>
			<MobileTopbar me={me} onMenuClick={() => setDrawerOpen(true)} />
			{drawerOpen && (
				// biome-ignore lint/a11y/noStaticElementInteractions: scrim closes the drawer; keyboard users close via Escape (handled above) or the drawer's own close button
				// biome-ignore lint/a11y/useKeyWithClickEvents: see above
				<div
					onClick={() => setDrawerOpen(false)}
					className={css({
						display: { base: "block", md: "none" },
						position: "fixed",
						inset: 0,
						bg: "bg.overlay/60",
						zIndex: "40",
					})}
				/>
			)}
			<div
				className={css({
					display: "flex",
					maxWidth: "1320px",
					marginInline: "auto",
					minHeight: "100dvh",
				})}
			>
				<SidebarNav
					me={me}
					drawerOpen={drawerOpen}
					onNavigate={() => setDrawerOpen(false)}
				/>
				<main className={css({ flex: 1, minWidth: 0 })}>{children}</main>
			</div>
		</div>
	)
}

function MobileTopbar({
	me,
	onMenuClick,
}: {
	me: Me
	onMenuClick: () => void
}) {
	return (
		<div
			className={css({
				display: { base: "flex", md: "none" },
				alignItems: "center",
				justifyContent: "space-between",
				position: "sticky",
				top: 0,
				zIndex: "20",
				bg: "bg.canvas",
				borderBottom: "1px solid {colors.border.default}",
				padding: "3.5 5",
			})}
		>
			<HStack gap="3">
				<button
					type="button"
					aria-label="Open menu"
					onClick={onMenuClick}
					className={css({
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						width: "8",
						height: "8",
						borderRadius: "lg",
						color: "fg.default",
						cursor: "pointer",
						_hover: { bg: "bg.surface" },
					})}
				>
					<FiMenu size={20} />
				</button>
				<Brand size="sm" />
			</HStack>
			{me ? (
				<AccountMenu name={me.name} username={me.username} variant="topbar" />
			) : (
				<Button
					variant="solid"
					size="sm"
					onClick={() => openModal(<AuthModal defaultView="signin" />)}
				>
					Log in
				</Button>
			)}
		</div>
	)
}

function SidebarNav({
	me,
	drawerOpen,
	onNavigate,
}: {
	me: Me
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
				borderRight: "1px solid",
				borderColor: "border.default",
				bg: "bg.canvas",
				position: { base: "fixed", md: "sticky" },
				top: 0,
				left: { base: 0, md: "auto" },
				height: "100dvh",
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
					<Brand />
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
							_hover: { bg: "bg.surface", color: "fg.default" },
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
							activeProps={{ className: css({ color: "fg.default" }) }}
							className={css({
								display: "flex",
								alignItems: "center",
								gap: "3.5",
								padding: "{spacing.2.5} {spacing.3}",
								borderRadius: "xl",
								fontSize: "sm",
								color: "fg.muted",
								fontWeight: "medium",
								_hover: { bg: "bg.surface", color: "fg.default" },
							})}
						>
							<item.icon size={20} />
							{item.label}
						</Link>
					))}
					{me && (
						<Link
							to="/new-question"
							className={css({
								padding: "{spacing.2.5} {spacing.3}",
								borderRadius: "xl",
								fontSize: "sm",
								color: "fg.muted",
								fontWeight: "medium",
								border: "1px solid transparent",
								_hover: {
									bg: "border.default",
									color: "fg.default",
									// border: "1px solid {colors.border.default}",
								},
							})}
						>
							+ New Question
						</Link>
					)}
				</nav>
			</VStack>

			<div className={css({ marginTop: "auto" })}>
				{me ? (
					<AccountMenu
						name={me.name}
						username={me.username}
						variant="sidebar"
					/>
				) : (
					<div
						className={css({
							display: "flex",
							flexDirection: "column",
							gap: "2",
						})}
					>
						<Button
							variant="solid"
							size="sm"
							fullWidth
							onClick={() => openModal(<AuthModal defaultView="signup" />)}
						>
							Sign up
						</Button>
						<Button
							variant="outline"
							size="sm"
							fullWidth
							onClick={() => openModal(<AuthModal defaultView="signin" />)}
						>
							Log in
						</Button>
					</div>
				)}
			</div>
		</div>
	)
}
