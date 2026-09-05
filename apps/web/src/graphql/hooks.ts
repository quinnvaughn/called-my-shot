import type { TypedDocumentNode } from "@graphql-typed-document-node/core"
import { type UseMutationOptions, useMutation } from "@tanstack/react-query"
import { gqlFetch } from "./fetcher"

// Codegen types a variable-less operation as `Exact<{ [key: string]: never }>`
// rather than an empty object, so accepting it as `void` is what lets those
// call sites stay `mutateAsync()` instead of `mutateAsync({})`. Wrapped in a
// tuple so the conditional doesn't distribute over `never` and collapse.
type MutationInput<TVariables> = [TVariables[keyof TVariables]] extends [never]
	? undefined
	: TVariables

export function useGqlMutation<TResult, TVariables>(
	document: TypedDocumentNode<TResult, TVariables>,
	options?: Omit<
		UseMutationOptions<TResult, Error, MutationInput<TVariables>>,
		"mutationFn"
	>,
) {
	return useMutation({
		mutationFn: (variables: MutationInput<TVariables>) =>
			gqlFetch(document, (variables ?? {}) as TVariables),
		...options,
	})
}
