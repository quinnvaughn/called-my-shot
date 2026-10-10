import type { TypedDocumentNode } from "@graphql-typed-document-node/core"
import { createIsomorphicFn } from "@tanstack/react-start"
import { type DocumentNode, Kind, print } from "graphql"
import { env } from "../env.server"
import { stripClientDirectives } from "./client-directives"

// The browser always talks to this app's own origin (same-origin /graphql,
// proxied server-side to the api) so the session cookie is never cross-site.
// SSR calls the api directly since that request never touches the browser.
const getGraphQLUrl = createIsomorphicFn()
	.server(() => env.API_INTERNAL_URL)
	.client(() => "/graphql")

// print() walks the entire document AST, and the same document object is
// re-sent constantly (every page of a list, every poll tick, every navigation
// back to a route). Keyed on the document identity codegen hands out, so an
// entry lives exactly as long as the module holding that document.
const printedDocuments = new WeakMap<DocumentNode, string>()

function printDocument(document: DocumentNode): string {
	const cached = printedDocuments.get(document)
	if (cached !== undefined) return cached
	const query = print(stripClientDirectives(document))
	printedDocuments.set(document, query)
	return query
}

// Query keys are built from this, so an unnamed operation would make every
// anonymous query collide on the same key. Codegen always emits a name;
// throwing here turns a hand-written mistake into an immediate failure
// rather than a cache that silently serves the wrong data.
export function getOperationName(document: DocumentNode): string {
	for (const definition of document.definitions) {
		if (definition.kind === Kind.OPERATION_DEFINITION) {
			if (!definition.name) break
			return definition.name.value
		}
	}
	throw new Error("GraphQL document has no named operation definition")
}

type GraphQLResponseError = { message: string }

export class GraphQLRequestError extends Error {
	readonly operationName: string
	readonly graphQLErrors: readonly GraphQLResponseError[]

	constructor(
		operationName: string,
		message: string,
		graphQLErrors: readonly GraphQLResponseError[] = [],
	) {
		super(message)
		this.name = "GraphQLRequestError"
		this.operationName = operationName
		this.graphQLErrors = graphQLErrors
	}
}

type GqlFetchOptions = {
	/**
	 * Forwarded during SSR so the api sees the browser's session. Omitted in
	 * the browser, where `credentials: "include"` sends it automatically.
	 */
	cookie?: string
	signal?: AbortSignal
}

export async function gqlFetch<TResult, TVariables>(
	document: TypedDocumentNode<TResult, TVariables>,
	variables: TVariables,
	options: GqlFetchOptions = {},
): Promise<TResult> {
	const operationName = getOperationName(document)

	const response = await fetch(getGraphQLUrl(), {
		method: "POST",
		credentials: "include",
		// Dropped in dev. A cancelled request (react-query superseding or
		// unmounting a query, a preload the pointer left) closes its socket
		// mid-request, and the dev server reports every one of those as an
		// `aborted` error overlay. Production has no overlay, so it keeps the
		// cancellation and the upstream work it saves.
		signal: import.meta.env.DEV ? undefined : options.signal,
		headers: {
			"content-type": "application/json",
			...(options.cookie ? { cookie: options.cookie } : {}),
		},
		body: JSON.stringify({
			operationName,
			query: printDocument(document),
			variables,
		}),
	})

	if (!response.ok) {
		throw new GraphQLRequestError(
			operationName,
			`${operationName} failed: ${response.status} ${response.statusText}`,
		)
	}

	const body = (await response.json()) as {
		data?: TResult
		errors?: GraphQLResponseError[]
	}

	// Matches the errorPolicy the app ran on before: a response carrying
	// errors is a failure even if it also carries partial data, so callers
	// never have to check for a half-populated result. Expected failures
	// (validation, not-found, forbidden) come back as typed result unions on
	// `data` instead and never reach this branch.
	if (body.errors?.length) {
		throw new GraphQLRequestError(
			operationName,
			`${operationName} failed: ${body.errors.map((error) => error.message).join("; ")}`,
			body.errors,
		)
	}

	if (body.data === undefined || body.data === null) {
		throw new GraphQLRequestError(
			operationName,
			`${operationName} returned no data`,
		)
	}

	return body.data
}
