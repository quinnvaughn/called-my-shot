import { devtools } from "@tanstack/devtools-vite"

import { tanstackStart } from "@tanstack/react-start/plugin/vite"

import viteReact from "@vitejs/plugin-react"
import { nitro } from "nitro/vite"
import { defineConfig } from "vite"

const config = defineConfig({
	resolve: { tsconfigPaths: true },
	// The SSR build otherwise splits into multiple chunks that end up with a
	// circular import between them (the router chunk and the root-route chunk
	// each import from the other). That ordering hazard causes the generated
	// GraphQL `documents` map (apps/web/src/graphql/generated/gql.ts) to read
	// as undefined mid-evaluation, crashing every SSR request with a 500.
	// Bundling SSR as a single file removes the chunk boundary entirely.
	environments: {
		ssr: {
			build: {
				rollupOptions: {
					output: { inlineDynamicImports: true },
				},
			},
		},
	},
	plugins: [
		devtools(),
		tanstackStart(),
		viteReact(),
		// Nitro registers its dev-request middleware directly in
		// `configureServer` (not via a returned post-hook), so - per Nitro's
		// own TanStack Start + Vite example - it has to be the last plugin:
		// Vite installs same-priority plugins' middleware in array order, and
		// an earlier nitro() intercepted requests (module/HMR fetches
		// included) before React/TanStack Start's own dev middleware got a
		// chance to handle them, which is what was causing edits to require a
		// hard refresh instead of hot-reloading.
		nitro({ rollupConfig: { external: [/^@sentry\//] } }),
	],
})

export default config
