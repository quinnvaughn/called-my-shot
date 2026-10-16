import { useQuery } from "@tanstack/react-query"
import { useMatches } from "@tanstack/react-router"
import { type ReactNode, useEffect, useState } from "react"
import { css } from "styled-system/css"
import { WalkthroughLauncher } from "#/components/onboarding/walkthrough-launcher"
import { PushPromptHost } from "#/components/push/push-prompt-host"
import { unreadNotificationCountQuery } from "#/graphql/notifications/queries"
import { useMe } from "#/hooks/use-me"
import { EmailBounceBanner } from "./email-bounce-banner"
import { SidebarNav } from "./sidebar-nav"
import { TopBar } from "./top-bar"
import type { League, Me } from "./types"
import { useRightRail } from "./use-right-rail"

export function AppShell({
	children,
	leagues,
}: {
	children: ReactNode
	leagues: League[]
}) {
	const rawMe = useMe()
	const me: Me = rawMe
		? {
				name: rawMe.name ?? "",
				username: rawMe.username ?? "",
				avatarUrl: rawMe.avatarUrl ?? null,
				isAdmin: rawMe.isAdmin ?? false,
			}
		: null
	const [drawerOpen, setDrawerOpen] = useState(false)
	const rightRail = useRightRail()
	const bareSignedOut = useMatches({
		select: (matches) => matches.some((m) => m.staticData?.bareSignedOut),
	})

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

	// The page draws its own chrome for someone who hasn't seen the app yet.
	if (!me && bareSignedOut) return children

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
			<TopBar
				me={me}
				unreadCount={unreadCount}
				onMenuClick={() => setDrawerOpen(true)}
			/>
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
					maxWidth: "1728px",
					marginInline: "auto",
				})}
			>
				<SidebarNav
					me={me}
					leagues={leagues}
					drawerOpen={drawerOpen}
					onNavigate={() => setDrawerOpen(false)}
				/>
				<main
					className={css({
						flex: 1,
						minWidth: 0,
						px: "6",
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
							// Under the top bar (h 16 in top-bar.tsx).
							top: "16",
							height: "calc(100dvh - {spacing.16})",
							overflowY: "auto",
							padding: "6",
							borderLeft: "1px solid {colors.border.default}",
							// A rail whose page has nothing for it this time (a
							// question with no game) gives its column back.
							_empty: { display: "none" },
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
			<PushPromptHost />
		</div>
	)
}
