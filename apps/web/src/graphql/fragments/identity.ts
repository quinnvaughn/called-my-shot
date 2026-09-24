import { graphql } from "#/graphql/generated"

// Everything the chip needs, already resolved by the api - a team flair's
// icon/label/color come off its team row there, so nothing here branches on
// source.
export const FlairFieldsFragment = graphql(`
	fragment Flair_flair on Flair {
		id
		key
		icon
		label
		color
	}
`)

// The avatar + name + @handle + flair cluster, in one place. Every document
// that credits someone spreads this instead of listing the fields, so the next
// thing added beside a name is one change here rather than a dozen documents.
export const IdentityUserFragment = graphql(`
	fragment Identity_user on User {
		id
		name
		username
		avatarUrl
		equippedFlair {
			...Flair_flair
		}
	}
`)
