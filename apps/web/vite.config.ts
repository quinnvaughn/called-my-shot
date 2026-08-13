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
		nitro({ rollupConfig: { external: [/^@sentry\//] } }),
		tanstackStart(),
		viteReact(),
	],
})

export default config
