import {
	createMemoryHistory,
	createRootRoute,
	createRouter,
	RouterProvider,
} from "@tanstack/react-router"
import { render } from "@testing-library/react"
import type { ReactNode } from "react"

// Any component rendering a <Link> needs a router above it, or useLinkProps
// throws on a null context. A memory router over a single root route is the
// smallest thing that satisfies that: these tests are about what the
// component draws, not about navigation, so the tree deliberately holds
// nothing but the subject.
// Awaited because RouterProvider renders nothing until the router's first
// load resolves - without it every query runs against an empty document.
export async function renderWithRouter(ui: ReactNode) {
	const rootRoute = createRootRoute({ component: () => <>{ui}</> })
	const router = createRouter({
		routeTree: rootRoute,
		history: createMemoryHistory({ initialEntries: ["/"] }),
	})
	await router.load()
	return render(
		// biome-ignore lint/suspicious/noExplicitAny: the generated route tree
		// is what RouterProvider's types expect, and this throwaway tree can't
		// satisfy them without redeclaring the app's whole registry.
		<RouterProvider router={router as any} />,
	)
}
