import type { CodegenConfig } from "@graphql-codegen/cli"

const config: CodegenConfig = {
	schema: "../api/schema.graphql",
	documents: ["src/**/*.{ts,tsx}"],
	ignoreNoDocuments: true,
	generates: {
		"./src/graphql/generated/": {
			preset: "client",
			config: {
				useTypeImports: true,
				// The API serialises DateTime as an ISO 8601 string.
				scalars: { DateTime: "string" },
				// `...X @unmask` inlines a fragment's fields at the spread instead
				// of masking them. The directive is client-only: fetcher.ts strips
				// it before a document is sent.
				customDirectives: { apolloUnmask: true },
			},
		},
	},
}

export default config
