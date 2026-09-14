import { graphql } from "#/graphql/generated"

// Both return the user so the client can read the new timestamp off the
// result. It flows back into router context through the Me query, which is
// what the checklist checks to decide whether to render itself.

export const DismissOnboardingDocument = graphql(`
	mutation DismissOnboarding {
		dismissOnboarding {
			__typename
			... on User {
				id
				onboardingDismissedAt
			}
			... on AuthenticationError {
				message
			}
		}
	}
`)

export const RestartOnboardingDocument = graphql(`
	mutation RestartOnboarding {
		restartOnboarding {
			__typename
			... on User {
				id
				onboardingDismissedAt
			}
			... on AuthenticationError {
				message
			}
		}
	}
`)

// Takes the state to set rather than toggling: the client already knows which
// way it is going, and a toggle would race two clicks into the wrong state.
export const SetOnboardingCollapsedDocument = graphql(`
	mutation SetOnboardingCollapsed($collapsed: Boolean!) {
		setOnboardingCollapsed(collapsed: $collapsed) {
			__typename
			... on User {
				id
				onboardingCollapsedAt
			}
			... on AuthenticationError {
				message
			}
		}
	}
`)

// Fired by the leaderboard page for a signed-in viewer. The server keeps the
// first visit's timestamp, so sending it again is harmless. What it changes
// is read through ViewerOnboarding, not off this result.
export const MarkLeaderboardViewedDocument = graphql(`
	mutation MarkLeaderboardViewed {
		markLeaderboardViewed {
			__typename
			... on User {
				id
			}
			... on AuthenticationError {
				message
			}
		}
	}
`)
