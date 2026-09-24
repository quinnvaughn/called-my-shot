import type { FlairData } from "#/components/ui/flair"
import {
	FlairFieldsFragment,
	IdentityUserFragment,
} from "#/graphql/fragments/identity"
// Despite the name the client preset generates, this is a plain unwrap of a
// masked fragment, not a React hook - it holds no state and has no call-order
// rules. Aliased so it can be called from a helper and inside a .map without
// tripping the rules-of-hooks lint.
import { type FragmentType, useFragment as unmask } from "#/graphql/generated"

// The flat shape every identity-rendering component takes. Unwrapped once at
// the data boundary so the components themselves stay plain props and can be
// rendered from a test without a GraphQL document.
export type IdentityData = {
	id: string
	name: string
	username: string
	avatarUrl: string | null
	flair: FlairData | null
}

// What a document has to select for toIdentity to read it: the masked ref a
// `...Identity_user` spread produces. Components that map rows name this
// rather than re-deriving it.
export type IdentityUser = FragmentType<typeof IdentityUserFragment>

// For documents that select a flair without the rest of the identity cluster
// - the Me query, whose name and username are already read directly all over
// the app and aren't worth masking.
export type FlairRef = FragmentType<typeof FlairFieldsFragment>

export function toFlair(flair: FlairRef | null | undefined): FlairData | null {
	if (!flair) return null
	const data = unmask(FlairFieldsFragment, flair)
	return { icon: data.icon, label: data.label, color: data.color }
}

export function toIdentity(user: IdentityUser): IdentityData {
	const data = unmask(IdentityUserFragment, user)
	return {
		id: data.id,
		name: data.name,
		username: data.username,
		avatarUrl: data.avatarUrl ?? null,
		flair: toFlair(data.equippedFlair),
	}
}
