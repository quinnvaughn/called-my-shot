import { type DocumentNode, visit } from "graphql"

// Directives that only mean something to this app's codegen. `@unmask` inlines
// a fragment's fields into the spreading document's types instead of masking
// them. The api's schema has none of these and would reject any operation
// carrying one, so they come off before a document is sent - and before
// check-schema-compat validates it, so that check sees what the api will.
const CLIENT_DIRECTIVES = new Set(["unmask"])

export function stripClientDirectives(document: DocumentNode): DocumentNode {
	return visit(document, {
		Directive: (node) =>
			CLIENT_DIRECTIVES.has(node.name.value) ? null : undefined,
	})
}
