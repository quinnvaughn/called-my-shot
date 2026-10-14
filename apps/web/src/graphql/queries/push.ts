import { graphql } from "#/graphql/generated"

export const PushPublicKeyDocument = graphql(`
	query PushPublicKey {
		pushPublicKey
	}
`)

export const SavePushSubscriptionDocument = graphql(`
	mutation SavePushSubscription($input: SavePushSubscriptionInput!) {
		savePushSubscription(input: $input) {
			__typename
			... on AuthenticationError {
				message
			}
			... on ValidationError {
				fieldErrors {
					field
					message
				}
			}
		}
	}
`)

export const RemovePushSubscriptionDocument = graphql(`
	mutation RemovePushSubscription($endpoint: String!) {
		removePushSubscription(endpoint: $endpoint) {
			__typename
		}
	}
`)

export const SetPushPreferenceDocument = graphql(`
	mutation SetPushPreference($input: SetPushPreferenceInput!) {
		setPushPreference(input: $input) {
			__typename
			... on User {
				id
				mutedPushTypes
			}
			... on AuthenticationError {
				message
			}
		}
	}
`)

export const SendTestPushDocument = graphql(`
	mutation SendTestPush {
		sendTestPush {
			__typename
			... on TestPushResult {
				delivered
			}
			... on AuthenticationError {
				message
			}
		}
	}
`)
