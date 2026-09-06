import { relative } from "node:path"
import { CodeFileLoader } from "@graphql-tools/code-file-loader"
import { loadDocuments } from "@graphql-tools/load"
import {
	buildSchema,
	concatAST,
	NoUnusedFragmentsRule,
	specifiedRules,
	validate,
} from "graphql"

// Codegen builds this app's types from ../api/schema.graphql, generated from
// the api source sitting in the same commit - so the build always succeeds
// even when the queries reference fields the deployed api has never heard of.
// That skew only surfaces as a failed request in production, and gqlFetch
// throws on any errors array, so it takes out the whole route rather than
// degrading. This checks the documents against the schema the api is actually
// serving, turning that runtime break into a failed deploy.
const SCHEMA_URL =
	process.env.PROD_SCHEMA_URL ??
	"https://called-my-shot-api.fly.dev/schema.graphql"

async function fetchLiveSchema(url: string) {
	let response: Response
	try {
		response = await fetch(url)
	} catch (cause) {
		throw new Error(`Could not reach ${url}`, { cause })
	}

	if (!response.ok) {
		throw new Error(
			`${url} returned ${response.status} ${response.statusText}`,
		)
	}

	return buildSchema(await response.text())
}

const schema = await fetchLiveSchema(SCHEMA_URL)

const documents = await loadDocuments("src/**/*.{ts,tsx}", {
	loaders: [new CodeFileLoader()],
	// The generated gql.ts repeats every operation as a string literal in
	// `graphql()` overload signatures, which the loader plucks as real
	// documents - leaving every fragment defined twice and failing
	// UniqueFragmentNames before any schema check happens.
	ignore: ["src/graphql/generated/**"],
})

// Fragments live in the component files that use them and are spread from
// queries in other files, so each document is only valid alongside all the
// others.
const ast = concatAST(
	documents.flatMap((document) => (document.document ? [document.document] : [])),
)

// A fragment spread into nothing is dead code worth deleting, but it is not a
// reason to block a deploy - and the check should only ever fail for things
// that would actually break against the live api.
const rules = specifiedRules.filter((rule) => rule !== NoUnusedFragmentsRule)

const errors = validate(schema, ast, rules)

if (errors.length > 0) {
	console.error(
		`${errors.length} operation(s) invalid against the schema at ${SCHEMA_URL}:\n`,
	)
	for (const error of errors) {
		// concatAST keeps each node's original source, so errors can still name
		// the component the document was plucked from. The line numbers on the
		// error itself count from the start of that one document rather than
		// the file, so they are left off as more misleading than useful.
		const source = error.nodes?.[0]?.loc?.source?.name
		const where = source ? ` [${relative(process.cwd(), source)}]` : ""
		console.error(`  - ${error.message}${where}`)
	}
	console.error(
		"\nThe api is missing something the web app asks for. Deploy the api first.",
	)
	process.exit(1)
}

console.log(
	`${documents.length} document(s) valid against the schema at ${SCHEMA_URL}`,
)
