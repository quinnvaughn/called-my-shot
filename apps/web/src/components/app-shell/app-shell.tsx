import { useQuery } from "@tanstack/react-query"
import { useMatches } from "@tanstack/react-router"
import type { ReactNode } from "react"
import { css } from "styled-system/css"
import { WalkthroughLauncher } from "#/components/onboarding/walkthrough-launcher"
import { PushPromptHost } from "#/components/push/push-prompt-host"
import { unreadNotificationCountQuery } from "#/graphql/notifications/queries"
import { useMe } from "#/hooks/use-me"
import { BottomNav } from "./bottom-nav"
import { EmailBounceBanner } from "./email-bounce-banner"
import { SpaceColumn } from "./space-column"
import { SpaceRail } from "./space-rail"
import { SpaceTabs } from "./space-tabs"
import { TopBar } from "./top-bar"
import type { League, Me } from "./types"
import { useRightRail } from "./use-right-rail"
import { useSpace } from "./use-space"

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
				emailBouncedAt: rawMe.emailBouncedAt ?? null,
			}
		: null
	const space = useSpace(leagues)
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
			<TopBar me={me} unreadCount={unreadCount} />
			<div
				className={css({
					display: "flex",
					maxWidth: "1728px",
					marginInline: "auto",
				})}
			>
				<SpaceRail me={me} leagues={leagues} space={space} />
				<SpaceColumn me={me} space={space} />
				<main
					className={css({
						flex: 1,
						minWidth: 0,
						px: "6",
						padding: {
							base: "5",
							xl: "{spacing.6} {spacing.8}",
						},
						// Clear of the bottom nav (see styles.css).
						paddingBottom: {
							base: "calc({spacing.5} + var(--bottom-nav-height))",
							xl: "6",
						},
					})}
				>
					{me?.emailBouncedAt && (
						<div className={css({ marginBottom: "5" })}>
							<EmailBounceBanner />
						</div>
					)}
					<SpaceTabs space={space} />
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
			<BottomNav me={me} space={space} />
			{/* Fixed, so it belongs to the shell rather than to any one page -
			    the offer follows the user around until they take it or close
			    it. Outside the layout row above so the right rail's sticky
			    column has no say in where it sits. */}
			<WalkthroughLauncher />
			<PushPromptHost />
		</div>
	)
}
