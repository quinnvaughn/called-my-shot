import { graphql } from "#/graphql/generated"

// Both return the user, so the caller can read the new equippedFlair off the
// result instead of refetching Me.
export const EquipFlairDocument = graphql(`
	mutation EquipFlair($flairId: ID!) {
		equipFlair(flairId: $flairId) {
			__typename
			... on User {
				id
				equippedFlair {
					...Flair_flair
				}
			}
			... on ValidationError {
				message
			}
		}
	}
`)

export const UnequipFlairDocument = graphql(`
	mutation UnequipFlair {
		unequipFlair {
			__typename
			... on User {
				id
				equippedFlair {
					...Flair_flair
				}
			}
		}
	}
`)
