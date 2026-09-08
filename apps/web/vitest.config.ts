import react from "@vitejs/plugin-react"
import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

// Deliberately not extending vite.config.ts: that one loads the TanStack Start
// and Panda plugins, which build a whole app router and stylesheet nothing
// here needs. Tests want the JSX transform, the two path aliases, and a DOM.
export default defineConfig({
	plugins: [react()],
	resolve: {
		alias: {
			"#": fileURLToPath(new URL("./src", import.meta.url)),
			"styled-system": fileURLToPath(
				new URL("./styled-system", import.meta.url),
			),
		},
	},
	test: {
		environment: "jsdom",
		globals: true,
		setupFiles: ["./src/test/setup.ts"],
		include: ["src/**/*.test.{ts,tsx}"],
	},
})
