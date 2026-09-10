import { graphql } from "#/graphql/generated"

// What the launcher and the get-started checklist need, in one round trip.
//
// The three booleans are derived server-side from the user's actual rows
// rather than stored progress flags, so no step can get stuck showing as
// outstanding for someone who already did it, and a long-standing account
// opens the checklist already ticked instead of being told to start over.
//
// suggestedQuestion is the answer to "what should a brand new user call?" and
// is null only when nothing at all is open - see apps/api/src/lib/onboarding.ts
// for the ladder that keeps it populated even in the offseason. Only the few
// fields the launcher shows are selected, deliberately not the full
// QuestionCard_question fragment: this is a one-line prompt, not a feed card.
export const ViewerOnboardingDocument = graphql(`
	query ViewerOnboarding {
		viewerOnboarding {
			__typename
			... on ViewerOnboarding {
				hasCalled
				hasGroup
				hasCreatedQuestion
				suggestedQuestion {
					id
					title
					locksAt
					league {
						id
						abbreviation
					}
					game {
						id
						startsAt
					}
				}
			}
		}
	}
`)
