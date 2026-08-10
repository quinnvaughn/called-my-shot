import { ApolloProvider } from "@apollo/client/react"
import { TanStackDevtools } from "@tanstack/react-devtools"
import {
	createRootRouteWithContext,
	HeadContent,
	Scripts,
} from "@tanstack/react-router"
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools"

import { ModalHost } from "#/components/ui/modal"
import { MeDocument } from "#/graphql/queries/me"
import type { RouterContext } from "../router-context"
import appCss from "../styles.css?url"

export const Route = createRootRouteWithContext<RouterContext>()({
	beforeLoad: async ({ context }) => {
		const { data } = await context.apolloClient.query({ query: MeDocument })
		return { me: data?.me ?? null }
	},
	head: () => ({
		meta: [
			{
				charSet: "utf-8",
			},
			{
				name: "viewport",
				content: "width=device-width, initial-scale=1",
			},
			{
				title: "Called My Shot",
			},
			{
				name: "description",
				content:
					"Call outcomes, set your conviction, and get paid more for bold picks against the crowd. No real money, no house edge — just your accuracy on the record.",
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
					"Call outcomes, set your conviction, and get paid more for bold picks against the crowd. No real money, no house edge — just your accuracy on the record.",
			},
			{
				property: "og:url",
				content: "https://calledmyshot.com/",
			},
			{
				property: "og:image",
				content: "https://calledmyshot.com/android-chrome-512x512.png",
			},
			{
				name: "twitter:card",
				content: "summary",
			},
			{
				name: "twitter:title",
				content: "Called My Shot",
			},
			{
				name: "twitter:description",
				content:
					"Call outcomes, set your conviction, and get paid more for bold picks against the crowd. No real money, no house edge — just your accuracy on the record.",
			},
			{
				name: "twitter:image",
				content: "https://calledmyshot.com/android-chrome-512x512.png",
			},
		],
		links: [
			{
				rel: "preconnect",
				href: "https://fonts.googleapis.com",
			},
			{
				rel: "stylesheet",
				href: "https://fonts.googleapis.com/css2?family=Archivo+Black&family=Space+Mono:wght@400;700&family=Inter:wght@400;500;600;700&display=swap",
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
	const { apolloClient } = Route.useRouteContext()

	return (
		<html lang="en">
			<head>
				<HeadContent />
			</head>
			<body>
				<ApolloProvider client={apolloClient}>
					{children}
					<ModalHost />
					<TanStackDevtools
						config={{
							position: "bottom-right",
						}}
						plugins={[
							{
								name: "Tanstack Router",
								render: <TanStackRouterDevtoolsPanel />,
							},
						]}
					/>
				</ApolloProvider>
				<Scripts />
			</body>
		</html>
	)
}
