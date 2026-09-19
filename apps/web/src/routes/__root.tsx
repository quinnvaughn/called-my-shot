import {
	createRootRouteWithContext,
	HeadContent,
	Scripts,
	useRouterState,
} from "@tanstack/react-router"
import { useEffect } from "react"

import { ModalHost } from "#/components/ui/modal"
import { RouteError } from "#/components/ui/route-error"
import { ToastHost } from "#/components/ui/toast"
import { MeDocument } from "#/graphql/queries/me"
import { gqlQueryOptions } from "#/graphql/query-options"
import {
	identifyUser,
	initAnalytics,
	resetAnalytics,
	trackPageview,
} from "#/lib/analytics"
import fontsCss from "../fonts.css?url"
import type { RouterContext } from "../router-context"
import appCss from "../styles.css?url"

const meQuery = gqlQueryOptions(MeDocument, {})

export const Route = createRootRouteWithContext<RouterContext>()({
	beforeLoad: async ({ context }) => {
		const data = await context.queryClient.query(meQuery)
		return { me: data.me ?? null }
	},
	// The viewer query above runs before anything else renders, so a failure
	// here (api down, network blip) has nothing below it to catch. Declared on
	// the root specifically rather than relying on defaultErrorComponent so it
	// renders inside shellComponent's <html>/<body> - an error page instead of
	// a bare document shell.
	errorComponent: RouteError,
	head: () => ({
		meta: [
			{
				charSet: "utf-8",
			},
			{
				name: "viewport",
				content:
					"width=device-width, initial-scale=1, maximum-scale=1, user-scalable=0",
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
					"Make calls on real games for free. Every call goes on your record, and your friends can see who actually called it.",
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
					"Make calls on real games for free. Every call goes on your record, and your friends can see who actually called it.",
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
					"Make calls on real games for free. Every call goes on your record, and your friends can see who actually called it.",
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
		],
	}),
	shellComponent: RootDocument,
})

function RootDocument({ children }: { children: React.ReactNode }) {
	const { me } = Route.useRouteContext()

	useEffect(() => {
		initAnalytics()
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

	useEffect(() => {
		trackPageview(locationHref)
	}, [locationHref])

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
