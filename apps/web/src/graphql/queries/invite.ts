import { graphql } from "#/graphql/generated"
import { gqlQueryOptions } from "#/graphql/query-options"

// The invite screen: the viewer's own link, wallet and how their invites are
// doing. All of it is private-gated on the server (see canSeePrivate), so
// every field here is null for anyone but the viewer.
export const InvitePageDocument = graphql(`
	query InvitePage {
		me {
			id
			username
			referralCode
			redoBalance
			referralStats {
				invited
				called
				waiting
			}
		}
	}
`)

// Not abortable: OutOfRedosModal opens with this too (see gqlQueryOptions).
export const invitePageQuery = () =>
	gqlQueryOptions(InvitePageDocument, {}, { abortable: false })

// What /join/:code shows before the visitor has an account.
export const ReferralPreviewDocument = graphql(`
	query ReferralPreview($code: String!) {
		referralPreview(code: $code) {
			redoBalanceCap
			inviter {
				id
				name
				username
				...Identity_user
				careerStats {
					rank
					totalPoints
					accuracy
					resolvedCallCount
				}
				recentCalls {
					id
					...CallCard_call
				}
			}
		}
	}
`)

export const referralPreviewQuery = (code: string) =>
	gqlQueryOptions(ReferralPreviewDocument, { code })
