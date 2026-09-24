import { graphql } from "#/graphql/generated"

export const MeDocument = graphql(`
	query Me {
		me {
			id
			name
			username
			avatarUrl
			email
			isAdmin
			emailVerified
			emailBouncedAt
			isVerifiedPundit
			questionCreationEnabled
			createdAt
			onboardingDismissedAt
			onboardingCollapsedAt
			# On the root query because the redo CTA is offered wherever the
			# viewer's own open call appears, and the count is per-viewer
			# rather than per-call - see Call.viewerCanRedo, which deliberately
			# leaves the balance out.
			redoBalance
		}
	}
`)
