import { readFile } from "node:fs/promises"
import { relative, resolve } from "node:path"
import { CodeFileLoader } from "@graphql-tools/code-file-loader"
import { loadDocuments } from "@graphql-tools/load"
import {
	buildSchema,
	concatAST,
	type DocumentNode,
	type GraphQLError,
	type GraphQLSchema,
	NoUnusedFragmentsRule,
	specifiedRules,
	validate,
} from "graphql"
import { stripClientDirectives } from "../src/graphql/client-directives"

// Codegen builds this app's types from ../api/schema.graphql, generated from
// the api source sitting in the same commit - so the build always succeeds
// even when the queries reference fields the deployed api has never heard of.
// That skew only surfaces as a failed request in production, and gqlFetch
// throws on any errors array, so it takes out the whole route rather than
// degrading. This checks the documents against the schema the api is actually
// serving, turning that runtime break into a failed deploy.

// A Dockerfile ARG that was never passed still reaches the process as an
// empty string rather than as unset, which ?? would happily accept - and an
// empty attempt count parses to 0, which would skip the whole retry loop and
// let the check pass without ever contacting the api. Both readers treat
// blank and unparseable as absent.
function envString(name: string, fallback: string): string {
	const value = process.env[name]
	return value && value.trim() !== "" ? value.trim() : fallback
}

function envCount(name: string, fallback: number): number {
	const raw = process.env[name]
	if (!raw || raw.trim() === "") return fallback
	const parsed = Number(raw)
	return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

const SCHEMA_URL = envString(
	"PROD_SCHEMA_URL",
	"https://called-my-shot-api.fly.dev/schema.graphql",
)

// The schema printed from the api source in this same commit. Used to tell a
// lagging deploy apart from a genuine mistake - see below.
const LOCAL_SCHEMA_PATH = resolve(
	process.cwd(),
	envString("LOCAL_SCHEMA_PATH", "../api/schema.graphql"),
)

// Only for reaching the api at all - a machine still coming up right after
// its own deploy. The api is always released before web (see
// .github/workflows/deploy.yml), so a schema it does answer with is the one
// web ships against, and a mismatch fails at once rather than being waited on.
const ATTEMPTS = envCount("SCHEMA_CHECK_ATTEMPTS", 6)
const RETRY_DELAY_MS = envCount("SCHEMA_CHECK_RETRY_MS", 10_000)

// A fragment spread into nothing is dead code worth deleting, but it is not a
// reason to block a deploy - the check should only fail for things that would
// actually break against the live api.
const rules = specifiedRules.filter((rule) => rule !== NoUnusedFragmentsRule)

async function loadAst(): Promise<DocumentNode> {
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
	// others. Stripped the same way gqlFetch strips them, so what's checked is
	// what the api actually receives.
	return stripClientDirectives(
		concatAST(
			documents.flatMap((document) =>
				document.document ? [document.document] : [],
			),
		),
	)
}

async function readLocalSchema(): Promise<GraphQLSchema | null> {
	try {
		return buildSchema(await readFile(LOCAL_SCHEMA_PATH, "utf8"))
	} catch {
		// Only present once api's schema:print has run. Absent is fine - it
		// just means the live check below has to stand on its own.
		return null
	}
}

async function fetchLiveSchema(url: string): Promise<GraphQLSchema> {
	const response = await fetch(url)
	if (!response.ok) {
		throw new Error(`${url} returned ${response.status} ${response.statusText}`)
	}
	return buildSchema(await response.text())
}

function report(errors: readonly GraphQLError[]) {
	for (const error of errors) {
		// concatAST keeps each node's original source, so errors can still name
		// the component the document was plucked from. The line numbers on the
		// error itself count from the start of that one document rather than
		// the file, so they are left off as more misleading than useful.
		const source = error.nodes?.[0]?.loc?.source?.name
		const where = source ? ` [${relative(process.cwd(), source)}]` : ""
		console.error(`  - ${error.message}${where}`)
	}
}

const ast = await loadAst()

// Checked first so a plain mistake reads as one: if the queries do not even
// match the api sitting in this commit, the fix is a missing resolver, not
// anything about the deploy.
const localSchema = await readLocalSchema()
if (localSchema) {
	const localErrors = validate(localSchema, ast, rules)
	if (localErrors.length > 0) {
		console.error(
			`${localErrors.length} operation(s) invalid against this commit's own schema:\n`,
		)
		report(localErrors)
		console.error(
			"\nThese queries do not match the api in this commit - a resolver is missing, not a deploy.",
		)
		process.exit(1)
	}
}

// Everything valid locally, so a failure from here means the live api is
// behind this commit - most likely its deploy failed or was rolled back.
for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
	let liveSchema: GraphQLSchema
	try {
		liveSchema = await fetchLiveSchema(SCHEMA_URL)
	} catch (error) {
		console.warn(
			`  attempt ${attempt}/${ATTEMPTS}: ${error instanceof Error ? error.message : error}`,
		)
		if (attempt === ATTEMPTS) {
			console.error(`\nCould not reach ${SCHEMA_URL}.`)
			process.exit(1)
		}
		await new Promise((r) => setTimeout(r, RETRY_DELAY_MS))
		continue
	}

	const errors = validate(liveSchema, ast, rules)
	if (errors.length === 0) {
		console.log(`Documents valid against the live schema at ${SCHEMA_URL}`)
		process.exit(0)
	}

	console.error(
		`${errors.length} operation(s) invalid against the live schema at ${SCHEMA_URL}:\n`,
	)
	report(errors)
	console.error(
		"\nThe live api is missing what this commit's web asks for - check that the api deploy for this commit succeeded, then re-run.",
	)
	process.exit(1)
}

// The loop above always exits by its final attempt, so reaching this line
// would mean it ran zero times. Exiting non-zero keeps a misconfigured
// attempt count from reading as a passing check.
process.exit(1)
