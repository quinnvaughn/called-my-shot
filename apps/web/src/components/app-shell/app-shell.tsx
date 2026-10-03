import { useQuery } from "@tanstack/react-query"
import { Link, useMatches, useRouteContext } from "@tanstack/react-router"
import { type ReactNode, useEffect, useState } from "react"
import { BsBarChartFill } from "react-icons/bs"
import { FaSquareCheck, FaUser, FaUserGroup } from "react-icons/fa6"
import { FiBell, FiMenu, FiX } from "react-icons/fi"
import { GoHomeFill } from "react-icons/go"
import type { IconType } from "react-icons/lib"
import { css, cx } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { AuthModal } from "#/components/auth/auth-modal"
import { WalkthroughLauncher } from "#/components/onboarding/walkthrough-launcher"
import { Brand } from "#/components/ui/brand"
import { Button, button } from "#/components/ui/button"
import { Tag } from "#/components/ui/tag"
import type { SeasonPhase } from "#/graphql/generated/graphql"
import { unreadNotificationCountQuery } from "#/graphql/queries/notifications"
import { openModal } from "#/stores/modal-store"
import { AccountMenu } from "./account-menu"
import { EmailBounceBanner } from "./email-bounce-banner"
import { MoreMenu } from "./more-menu"

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

type Me = {
	name: string
	username: string
	avatarUrl: string | null
	isAdmin: boolean
	emailBouncedAt?: string | null
} | null
type League = {
	id: string
	name: string
	abbreviation: string
	slug: string
	currentSeason?: { phase: SeasonPhase } | null
}

export function AppShell({
	children,
	leagues,
}: {
	children: ReactNode
	leagues: League[]
}) {
	const { me: rawMe } = useRouteContext({ from: "__root__" })
	const me: Me = rawMe
		? {
				name: rawMe.name ?? "",
				username: rawMe.username ?? "",
				avatarUrl: rawMe.avatarUrl ?? null,
				isAdmin: rawMe.isAdmin ?? false,
			}
		: null
	const [drawerOpen, setDrawerOpen] = useState(false)
	const matches = useMatches()
	const rightRail = [...matches]
		.reverse()
		.find((match) => match.staticData?.rightRail)?.staticData.rightRail

	// Shares notifications-list.tsx's options object so the key it invalidates
	// after marking rows read is exactly the key this reads.
	const { data: unreadData } = useQuery({
		...unreadNotificationCountQuery,
		enabled: !!me,
		refetchInterval: 30_000,
	})
	const unreadCount =
		unreadData?.unreadNotificationCount.__typename ===
		"QueryUnreadNotificationCountSuccess"
			? unreadData.unreadNotificationCount.data
			: 0

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
		// overflowX clip: PageBanner bleeds to the window edge using 100vw, which
		// counts a classic scrollbar's width. Clip rather than hidden, so this
		// isn't a scroll container and the right rail's sticky still works.
		<div
			className={css({
				minHeight: "100dvh",
				bg: "bg.canvas",
				overflowX: "clip",
			})}
		>
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
					unreadCount={unreadCount}
					leagues={leagues}
					drawerOpen={drawerOpen}
					onNavigate={() => setDrawerOpen(false)}
				/>
				<main
					className={css({
						flex: 1,
						minWidth: 0,
						px: "6",
						borderRight: rightRail
							? "1px solid {colors.border.default}"
							: "none",
						padding: {
							base: "5",
							xl: "{spacing.6} {spacing.8}",
						},
					})}
				>
					{me?.emailBouncedAt && (
						<div className={css({ marginBottom: "5" })}>
							<EmailBounceBanner />
						</div>
					)}
					{children}
				</main>
				{rightRail && (
					<div
						className={css({
							display: { base: "none", xl: "block" },
							width: "80",
							flexShrink: 0,
							position: "sticky",
							top: 0,
							height: "100dvh",
							overflowY: "auto",
							padding: "6",
						})}
					>
						{rightRail}
					</div>
				)}
			</div>
			{/* Fixed, so it belongs to the shell rather than to any one page -
			    the offer follows the user around until they take it or close
			    it. Outside the layout row above so the right rail's sticky
			    column has no say in where it sits. */}
			<WalkthroughLauncher />
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
				padding: "{spacing.3.5} {spacing.5}",
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
						_hover: { bg: "fg.default/10" },
					})}
				>
					<FiMenu size={20} />
				</button>
				<Brand size="nav" />
			</HStack>
			{me ? (
				<AccountMenu
					name={me.name}
					username={me.username}
					avatarUrl={me.avatarUrl}
					variant="topbar"
				/>
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
								<span
									className={css({
										marginLeft: "auto",
										bg: "primary.default",
										color: "bg.canvas",
										fontFamily: "mono",
										fontSize: "2xs",
										fontWeight: "bold",
										borderRadius: "full",
										paddingInline: "1.5",
										minWidth: "5",
										textAlign: "center",
										lineHeight: "1.6",
									})}
								>
									{unreadCount > 99 ? "99+" : unreadCount}
								</span>
							)}
						</Link>
					))}
					<MoreMenu
						signedIn={!!me}
						isAdmin={me?.isAdmin ?? false}
						onNavigate={onNavigate}
					/>

					{leagues.length > 0 && (
						<VStack alignItems="stretch" gap="1.5">
							<span
								className={css({
									fontFamily: "mono",
									fontSize: "2xs",
									letterSpacing: "wide",
									color: "fg.subtle",
									paddingInline: "3",
								})}
							>
								LEAGUES
							</span>
							{leagues.map((league) => (
								<Link
									key={league.id}
									to="/leagues/$leagueSlug"
									params={{ leagueSlug: league.slug }}
									onClick={onNavigate}
									activeProps={{
										className: css({
											bg: "bg.subtle",
											color: "fg.default",
										}),
									}}
									className={css({
										display: "flex",
										alignItems: "center",
										gap: "2.5",
										padding: "{spacing.2} {spacing.3}",
										borderRadius: "lg",
										fontSize: "sm",
										fontWeight: "medium",
										color: "fg.subtle",
										_hover: { bg: "fg.default/10", color: "fg.default" },
									})}
								>
									<span
										className={css({
											display: "flex",
											alignItems: "center",
											justifyContent: "center",
											width: "6",
											height: "6",
											flexShrink: 0,
											borderRadius: "md",
											bg: "bg.subtle",
											border: "1px solid {colors.border.default}",
											fontFamily: "mono",
											fontSize: "3xs",
											fontWeight: "bold",
										})}
									>
										{league.abbreviation}
									</span>
									{league.name}
									{league.currentSeason?.phase === "POSTSEASON" && (
										<span className={css({ marginInlineStart: "auto" })}>
											<Tag size="sm">Playoffs</Tag>
										</span>
									)}
								</Link>
							))}
						</VStack>
					)}
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

			<div className={css({ marginTop: "auto" })}>
				{me ? (
					<div className={css({ display: { base: "none", md: "block" } })}>
						<AccountMenu
							name={me.name}
							username={me.username}
							avatarUrl={me.avatarUrl}
							variant="sidebar"
						/>
					</div>
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
