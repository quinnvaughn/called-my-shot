import { BsBarChartFill } from "react-icons/bs"
import { FaQuestion } from "react-icons/fa"
import { FaFlag, FaSquareCheck } from "react-icons/fa6"
import { FiLifeBuoy, FiUserPlus, FiX, FiZap } from "react-icons/fi"
import { GoHomeFill } from "react-icons/go"
import { css } from "styled-system/css"
import { HStack } from "styled-system/jsx"
import { Brand } from "#/components/ui/brand"
import { SidebarGroups } from "./sidebar-groups"
import { SidebarLeagues } from "./sidebar-leagues"
import { SidebarNavLink } from "./sidebar-nav-link"
import { SidebarSection } from "./sidebar-section"
import { SidebarToggle } from "./sidebar-toggle"
import { SocialLinks } from "./social-links"
import type { League, Me } from "./types"
import { useScrollingFlag } from "./use-scrolling-flag"
import { useSidebarCollapsed } from "./use-sidebar-collapsed"

// Notifications, New Question and the account menu (profile, settings,
// admin) live in the top bar, so everything here is a place to go.
export function SidebarNav({
	me,
	leagues,
	drawerOpen,
	onNavigate,
}: {
	me: Me
	leagues: League[]
	drawerOpen: boolean
	onNavigate: () => void
}) {
	const onScroll = useScrollingFlag()
	const { collapsed, animated, toggle } = useSidebarCollapsed()
	return (
		<div
			className={css({
				// Collapsed (md up only) leaves a strip for the toggle to sit on.
				width: { base: "64", md: collapsed ? "6" : "64" },
				flexShrink: 0,
				display: "flex",
				flexDirection: "column",
				paddingTop: "env(safe-area-inset-top)",
				paddingBottom: "env(safe-area-inset-bottom)",
				borderRight: "1px solid {colors.border.default}",
				bg: "bg.canvas",
				// Below md it's a drawer over the whole screen, top bar included.
				// From md it sits under the top bar (h 16 in top-bar.tsx).
				position: { base: "fixed", md: "sticky" },
				top: { base: 0, md: "16" },
				left: { base: 0, md: "auto" },
				height: { base: "100dvh", md: "calc(100dvh - {spacing.16})" },
				maxWidth: { base: "82vw", md: "none" },
				// Its transform makes it a stacking context, so it needs a
				// z-index of its own for the toggle and its tooltip, which hang
				// past its right edge, to paint over the page. Under the top
				// bar's 20.
				zIndex: { base: "50", md: "10" },
				boxShadow: { base: "0 0 40px rgba(0, 0, 0, 0.4)", md: "none" },
				transform: {
					base: drawerOpen ? "translateX(0)" : "translateX(-100%)",
					md: "translateX(0)",
				},
				// Width only animates on a click of the toggle, not when a
				// collapsed state saved from last time is restored on load.
				transition: animated
					? "transform 0.22s ease, width 0.22s ease"
					: "transform 0.22s ease",
			})}
		>
			<SidebarToggle collapsed={collapsed} onToggle={toggle} />
			{/* Clips the contents while the width animates. The toggle stays
			    outside it, since it hangs past the sidebar's edge. */}
			<div
				className={css({
					flex: 1,
					minHeight: 0,
					overflow: "hidden",
					display: "flex",
				})}
			>
				{/* Holds its full width while the sidebar narrows around it, so
			    rows slide out of view rather than squashing. Hidden once
			    collapsed, which also takes its links out of the tab order. */}
				<div
					className={css({
						width: { base: "full", md: "64" },
						flexShrink: 0,
						display: "flex",
						flexDirection: "column",
						opacity: { base: 1, md: collapsed ? 0 : 1 },
						visibility: {
							base: "visible",
							md: collapsed ? "hidden" : "visible",
						},
						transition: collapsed
							? "opacity 0.15s ease, visibility 0s linear 0.15s"
							: "opacity 0.15s ease 0.07s",
					})}
				>
					{/* The sections scroll on their own once they outgrow the window;
			    the social links below stay pinned. */}
					<div
						className={css({
							flex: 1,
							minHeight: 0,
							overflowY: "auto",
							overscrollBehavior: "contain",
							display: "flex",
							flexDirection: "column",
							gap: "4",
							padding: { base: "{spacing.5} {spacing.4}", md: "{spacing.4}" },
							// One styled scrollbar on every platform, drawn only while
							// scrolling (data-scrolling, from useScrollingFlag). Chrome
							// ignores the ::-webkit-scrollbar rules once the standard
							// properties are set, so those are kept to browsers without
							// them (Firefox).
							"&::-webkit-scrollbar": { width: "8px" },
							"&::-webkit-scrollbar-track": { bg: "transparent" },
							"&::-webkit-scrollbar-thumb": {
								bg: "transparent",
								borderRadius: "full",
								border: "2px solid {colors.bg.canvas}",
							},
							"&[data-scrolling]::-webkit-scrollbar-thumb": {
								bg: "border.emphasized",
							},
							"&[data-scrolling]::-webkit-scrollbar-thumb:hover": {
								bg: "fg.subtle",
							},
							"@supports not selector(::-webkit-scrollbar)": {
								scrollbarWidth: "thin",
								scrollbarColor: "transparent transparent",
								"&[data-scrolling]": {
									scrollbarColor: "{colors.border.emphasized} transparent",
								},
							},
						})}
						onScroll={onScroll}
					>
						<HStack
							justifyContent="space-between"
							paddingInline="3"
							paddingBottom="2"
							display={{ base: "flex", md: "none" }}
						>
							<Brand size="nav" />
							<button
								type="button"
								aria-label="Close menu"
								onClick={onNavigate}
								className={css({
									display: "flex",
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
								gap: "3",
							})}
						>
							<div
								className={css({
									display: "flex",
									flexDirection: "column",
									gap: "0.5",
								})}
							>
								<SidebarNavLink
									to="/home"
									label="Home"
									icon={GoHomeFill}
									onNavigate={onNavigate}
								/>
								<SidebarNavLink
									to="/leaderboard"
									label="Leaderboard"
									icon={BsBarChartFill}
									onNavigate={onNavigate}
								/>
							</div>

							{me && (
								<SidebarSection id="you" label="YOU">
									<SidebarNavLink
										to="/my-calls"
										label="My Calls"
										icon={FaSquareCheck}
										onNavigate={onNavigate}
									/>
									<SidebarNavLink
										to="/my-questions"
										label="My Questions"
										icon={FaQuestion}
										onNavigate={onNavigate}
									/>
									<SidebarNavLink
										to="/challenges"
										label="Challenges"
										icon={FaFlag}
										onNavigate={onNavigate}
									/>
								</SidebarSection>
							)}

							<SidebarLeagues leagues={leagues} onNavigate={onNavigate} />

							{me && (
								<SidebarGroups leagues={leagues} onNavigate={onNavigate} />
							)}

							<SidebarSection id="resources" label="RESOURCES">
								{me && (
									<SidebarNavLink
										to="/invite"
										label="Invite a Friend"
										icon={FiUserPlus}
										onNavigate={onNavigate}
									/>
								)}
								<SidebarNavLink
									to="/updates"
									label="Updates"
									icon={FiZap}
									onNavigate={onNavigate}
								/>
								{me && (
									<SidebarNavLink
										to="/support"
										label="Support"
										icon={FiLifeBuoy}
										onNavigate={onNavigate}
									/>
								)}
							</SidebarSection>
						</nav>
					</div>

					<div
						className={css({
							padding: "{spacing.3} {spacing.4} {spacing.4}",
							borderTop: "1px solid {colors.border.default}",
						})}
					>
						<SocialLinks />
					</div>
				</div>
			</div>
		</div>
	)
}
