import { css } from "styled-system/css"
import { match } from "ts-pattern"
import { GroupSpaceColumn } from "./group-space-column"
import { HomeSpaceColumn } from "./home-space-column"
import { LeagueSpaceColumn } from "./league-space-column"
import { PlaySpaceColumn } from "./play-space-column"
import { SidebarToggle } from "./sidebar-toggle"
import { SocialLinks } from "./social-links"
import type { Space } from "./space"
import type { Me } from "./types"
import { useScrollingFlag } from "./use-scrolling-flag"
import { useSidebarCollapsed } from "./use-sidebar-collapsed"

// The column beside the space rail, md up: the current space's name and the
// places in it. Collapsing it leaves the rail. Below md the same sections
// are the tab row above the page (SpaceTabs).
export function SpaceColumn({ me, space }: { me: Me; space: Space }) {
	const onScroll = useScrollingFlag()
	const { collapsed, animated, toggle } = useSidebarCollapsed()
	return (
		<div
			className={css({
				display: { base: "none", md: "flex" },
				width: collapsed ? "0" : "56",
				flexShrink: 0,
				flexDirection: "column",
				paddingBottom: "env(safe-area-inset-bottom)",
				borderRight: collapsed ? "none" : "1px solid {colors.border.default}",
				bg: "bg.canvas",
				position: "sticky",
				// Under the top bar (h 16 in top-bar.tsx).
				top: "16",
				height: "calc(100dvh - {spacing.16})",
				// Its toggle and the toggle's tooltip hang past its right edge
				// and have to paint over the page. Under the top bar's 20.
				zIndex: "10",
				// Width only animates on a click of the toggle, not when a
				// collapsed state saved from last time is restored on load.
				transition: animated ? "width 0.22s ease" : "none",
			})}
		>
			<SidebarToggle collapsed={collapsed} onToggle={toggle} />
			{/* Clips the contents while the width animates. The toggle stays
			    outside it, since it hangs past the column's edge. */}
			<div
				className={css({
					flex: 1,
					minHeight: 0,
					overflow: "hidden",
					display: "flex",
				})}
			>
				{/* Holds its full width while the column narrows around it, so
				    rows slide out of view rather than squashing. Hidden once
				    collapsed, which also takes its links out of the tab order. */}
				<div
					className={css({
						width: "56",
						flexShrink: 0,
						display: "flex",
						flexDirection: "column",
						opacity: collapsed ? 0 : 1,
						visibility: collapsed ? "hidden" : "visible",
						transition: collapsed
							? "opacity 0.15s ease, visibility 0s linear 0.15s"
							: "opacity 0.15s ease 0.07s",
					})}
				>
					{/* The sections scroll on their own once they outgrow the
					    window; the social links below stay pinned. */}
					<div
						className={css({
							flex: 1,
							minHeight: 0,
							overflowY: "auto",
							overscrollBehavior: "contain",
							padding: "{spacing.5} {spacing.3}",
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
						<nav aria-label="Sections">
							{match(space)
								.with({ kind: "play" }, () => <PlaySpaceColumn />)
								.with({ kind: "league" }, ({ league }) => (
									<LeagueSpaceColumn league={league} />
								))
								.with({ kind: "group" }, ({ groupId }) => (
									<GroupSpaceColumn groupId={groupId} />
								))
								.with(
									{ kind: "home" },
									{ kind: "you" },
									{ kind: "spaces" },
									{ kind: "elsewhere" },
									() => <HomeSpaceColumn me={me} />,
								)
								.exhaustive()}
						</nav>
					</div>

					<div
						className={css({
							padding: "{spacing.3} {spacing.3} {spacing.4}",
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
