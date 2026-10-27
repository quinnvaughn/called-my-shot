import {
	createRootRouteWithContext,
	HeadContent,
	Scripts,
	useRouter,
	useRouterState,
} from "@tanstack/react-router"
import { useEffect, useRef } from "react"

import { ModalHost } from "#/components/ui/modal-host"
import { RouteError } from "#/components/ui/route-error"
import { ToastHost } from "#/components/ui/toast"
import { meQuery } from "#/graphql/me/queries"
import { useImportRankPlacements } from "#/hooks/use-import-rank-placements"
import { useImportSeasonGuesses } from "#/hooks/use-import-season-guesses"
import { useImportTeammateChain } from "#/hooks/use-import-teammate-chain"
import { usePushSync } from "#/hooks/use-push-sync"
import { useResumeAuthIntent } from "#/hooks/use-resume-auth-intent"
import { useStaleBuildGuard } from "#/hooks/use-stale-build-guard"
import { useSubmitGuestPicks } from "#/hooks/use-submit-guest-picks"
import {
	identifyUser,
	initAnalytics,
	resetAnalytics,
	trackPageview,
} from "#/lib/analytics"
import { useGoogleAuthReturn } from "#/lib/google-auth"
import { readShareLanding } from "#/lib/share-links"
import { rememberTimeZone, requestTimeZone } from "#/lib/time-zone"
import { closeAllModals } from "#/stores/modal-store"
import fontsCss from "../fonts.css?url"
import type { RouterContext } from "../router-context"
import appCss from "../styles.css?url"

export const Route = createRootRouteWithContext<RouterContext>()({
	beforeLoad: async ({ context }) => {
		try {
			const data = await context.queryClient.query(meQuery)
			return {
				me: data.me ?? null,
				timeZone: requestTimeZone(),
				now: Date.now(),
			}
		} catch (error) {
			// The viewer barely changes between navigations, so the last known
			// one is a better answer than tearing the app down. It also beats
			// falling back to null, which reads as signed out and would bounce
			// an admin off /admin mid-session. A signed-out viewer arrives as a
			// successful response carrying `me: null`, never as a throw, so
			// nothing here can resurrect a session the api has already ended.
			const cached = context.queryClient.getQueryData(meQuery.queryKey)
			if (!cached) throw error
			return {
				me: cached.me ?? null,
				timeZone: requestTimeZone(),
				now: Date.now(),
			}
		}
	},
	// Nothing renders above the viewer query, so the failures that still escape
	// it (no cached viewer to stand in, api down on a cold load) have nothing
	// below them to catch. Declared on the root specifically rather than
	// relying on defaultErrorComponent so it renders inside shellComponent's
	// <html>/<body> - an error page instead of a bare document shell.
	errorComponent: RouteError,
	head: () => ({
		meta: [
			{
				charSet: "utf-8",
			},
			{
				name: "viewport",
				content:
					"width=device-width, initial-scale=1, maximum-scale=1, user-scalable=0, viewport-fit=cover",
			},
			// How the app looks once it's added to a home screen: full screen,
			// with iOS's status bar drawn over the app's own dark canvas. The
			// safe-area insets that viewport-fit=cover exposes keep the fixed
			// bars clear of the notch and home indicator.
			{
				name: "mobile-web-app-capable",
				content: "yes",
			},
			{
				name: "apple-mobile-web-app-capable",
				content: "yes",
			},
			{
				name: "apple-mobile-web-app-status-bar-style",
				content: "black-translucent",
			},
			{
				name: "apple-mobile-web-app-title",
				content: "Called My Shot",
			},
			// Pins the color browsers/OSes use for link-preview tinting, mobile
			// address bar chrome, and PWA splash background to the app's actual
			// canvas color - without this, at least iMessage/Safari's link
			// previews fall back to sampling a dominant color out of whichever
			// icon happens to be referenced, which is how the share preview
			// ended up orange (matching the old icon's mostly-orange ring)
			// instead of the app's real near-black background.
			{
				name: "theme-color",
				content: "#0B0B0C",
			},
			{
				title: "Called My Shot",
			},
			{
				name: "description",
				content:
					"Daily sports puzzles and calls on real games, scored on private leaderboards with your group chat, your fantasy league, or your audience. Free, no money ever.",
			},
			{
				property: "og:type",
				content: "website",
			},
			{
				property: "og:site_name",
				content: "Called My Shot",
			},
			{
				property: "og:title",
				content: "Called My Shot",
			},
			{
				property: "og:description",
				content:
					"Daily sports puzzles and calls on real games, scored on private leaderboards with your group chat, your fantasy league, or your audience. Free, no money ever.",
			},
			{
				property: "og:url",
				content: "https://calledmyshot.com/",
			},
			{
				property: "og:image",
				content: "https://calledmyshot.com/og-image.png",
			},
			{
				name: "twitter:card",
				content: "summary_large_image",
			},
			{
				name: "twitter:title",
				content: "Called My Shot",
			},
			{
				name: "twitter:description",
				content:
					"Daily sports puzzles and calls on real games, scored on private leaderboards with your group chat, your fantasy league, or your audience. Free, no money ever.",
			},
			{
				name: "twitter:image",
				content: "https://calledmyshot.com/og-image.png",
			},
			{
				name: "twitter:url",
				content: "https://calledmyshot.com/",
			},
		],
		links: [
			// Archivo Black / Space Mono / Inter, self-hosted from public/fonts/
			// (see src/fonts.css) instead of fonts.googleapis.com - removes two
			// cross-origin round trips (CSS host + font-file host) from the
			// render-blocking path on first paint.
			{
				rel: "stylesheet",
				href: fontsCss,
			},
			{
				rel: "stylesheet",
				href: appCss,
			},
			{
				rel: "icon",
				type: "image/x-icon",
				href: "/favicon.ico",
			},
			{
				rel: "icon",
				type: "image/png",
				sizes: "32x32",
				href: "/favicon-32x32.png",
			},
			{
				rel: "apple-touch-icon",
				sizes: "180x180",
				href: "/apple-touch-icon.png",
			},
			{
				rel: "manifest",
				href: "/manifest.webmanifest",
			},
		],
	}),
	shellComponent: RootDocument,
})

function RootDocument({ children }: { children: React.ReactNode }) {
	const { me } = Route.useRouteContext()

	useStaleBuildGuard()
	const resumeAuthIntent = useResumeAuthIntent()
	useGoogleAuthReturn(me?.username ?? null, resumeAuthIntent)
	usePushSync(me?.id ?? null)
	useSubmitGuestPicks(me?.id ?? null)
	useImportSeasonGuesses(me?.id ?? null)
	useImportRankPlacements(me?.id ?? null)
	useImportTeammateChain(me?.id ?? null)

	useEffect(() => {
		initAnalytics()
		rememberTimeZone()
	}, [])

	useEffect(() => {
		if (me) {
			identifyUser(me)
		} else {
			resetAnalytics()
		}
	}, [me])

	const locationHref = useRouterState({
		select: (state) => state.location.href,
	})

	const router = useRouter()
	const lastTrackedHref = useRef<string | null>(null)

	// A shared link's params come off the address bar once the landing is
	// counted, so someone re-sharing the page from there doesn't pass on the
	// original sharer's ref. Removing them is a navigation of its own, and the
	// href it lands on is the one already tracked, so it isn't counted twice.
	useEffect(() => {
		const { landing, cleanHref } = readShareLanding(locationHref)
		if (cleanHref !== lastTrackedHref.current) {
			trackPageview(cleanHref, landing)
			lastTrackedHref.current = cleanHref
		}
		if (landing) {
			router.navigate({ href: cleanHref, replace: true, resetScroll: false })
		}
	}, [locationHref, router])

	// Pathname, not href: a modal that writes to the search params is still
	// on the same page and should stay open.
	const pathname = useRouterState({
		select: (state) => state.location.pathname,
	})

	// biome-ignore lint/correctness/useExhaustiveDependencies: runs on each page change
	useEffect(() => {
		closeAllModals()
	}, [pathname])

	return (
		<html lang="en">
			<head>
				<HeadContent />
			</head>
			<body>
				{children}
				<ModalHost />
				<ToastHost />
				<Scripts />
			</body>
		</html>
	)
}
