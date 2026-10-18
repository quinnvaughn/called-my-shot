import type { QueryClient } from "@tanstack/react-query"
import { graphql } from "#/graphql/generated"
import {
	AdminBallotDocument,
	AdminBallotSearchDocument,
	AdminBallotsDocument,
	AdminQuestionsDocument,
	AdminQueueSummaryDocument,
	AnsweredQuestionsDocument,
	BallotByRefDocument,
	BallotEntryDocument,
	CallRecordDocument,
	ChallengeCandidatesDocument,
	ChallengePageDocument,
	ChallengeReceiptDocument,
	CreatedQuestionsDocument,
	GameByIdDocument,
	GameEntryDocument,
	GameOfficialQuestionsDocument,
	GameQuestionsDocument,
	GroupBallotBoardDocument,
	GroupGameBoardDocument,
	GroupHomeDocument,
	GroupLeaderboardDocument,
	GroupLiveGamesDocument,
	GroupPreviewDocument,
	GroupStillOpenDocument,
	GroupWeekRaceDocument,
	HomeDashboardDocument,
	InvitePageDocument,
	LandingPageDocument,
	LeagueBallotsDocument,
	LeagueByIdDocument,
	LeagueGamesForWindowDocument,
	LeagueSeasonClosingSoonDocument,
	LeagueSeasonDocument,
	MeDocument,
	MyCallCountsDocument,
	MyCallsDocument,
	MyCallsPageDocument,
	MyChallengesDocument,
	MyLiveCallsDocument,
	MyQuestionsDocument,
	QuestionCallsDocument,
	QuestionDetailDocument,
	ReferralPreviewDocument,
	SharedQuestionsDocument,
	UserProfileDocument,
	UserRecordCalendarDocument,
	UserRecordDocument,
	UserReportCardPageDocument,
	UserStreakPageDocument,
	UserSweepPageDocument,
	ViewerOnboardingDocument,
} from "#/graphql/generated/graphql"
import { invalidateOperations } from "#/graphql/query-options"

export const CastCallDocument = graphql(`
	mutation CastCall($input: CastCallInput!) {
		castCall(input: $input) {
			__typename
			... on CastCallPayload {
				call {
					id
				}
			}
			... on ValidationError {
				fieldErrors {
					field
					message
				}
			}
			... on AuthenticationError {
				message
			}
			... on NotFoundError {
				message
			}
		}
	}
`)

export const RedoCallDocument = graphql(`
	mutation RedoCall($input: RedoCallInput!) {
		redoCall(input: $input) {
			__typename
			... on RedoCallPayload {
				redoBalance
				call {
					id
				}
			}
			... on ValidationError {
				fieldErrors {
					field
					message
				}
			}
			... on AuthenticationError {
				message
			}
			... on AuthorizationError {
				message
			}
			... on NotFoundError {
				message
			}
		}
	}
`)

// Every read a new or changed call can reach: the question's tallies and the
// viewer's pick on it wherever it's listed, the viewer's call lists, counts
// and pending record, ballot, game and challenge progress, group boards, and
// the redo balance a redo spends.
const CALL_DOCUMENTS = [
	AdminBallotDocument,
	AdminBallotSearchDocument,
	AdminBallotsDocument,
	AdminQuestionsDocument,
	AdminQueueSummaryDocument,
	AnsweredQuestionsDocument,
	BallotByRefDocument,
	BallotEntryDocument,
	CallRecordDocument,
	ChallengeCandidatesDocument,
	ChallengePageDocument,
	ChallengeReceiptDocument,
	CreatedQuestionsDocument,
	GameByIdDocument,
	GameEntryDocument,
	GameOfficialQuestionsDocument,
	GameQuestionsDocument,
	GroupBallotBoardDocument,
	GroupGameBoardDocument,
	GroupHomeDocument,
	GroupLeaderboardDocument,
	GroupLiveGamesDocument,
	GroupPreviewDocument,
	GroupStillOpenDocument,
	GroupWeekRaceDocument,
	HomeDashboardDocument,
	InvitePageDocument,
	LandingPageDocument,
	LeagueBallotsDocument,
	LeagueByIdDocument,
	LeagueGamesForWindowDocument,
	LeagueSeasonDocument,
	LeagueSeasonClosingSoonDocument,
	MeDocument,
	MyCallCountsDocument,
	MyCallsDocument,
	MyCallsPageDocument,
	MyChallengesDocument,
	MyLiveCallsDocument,
	MyQuestionsDocument,
	QuestionCallsDocument,
	QuestionDetailDocument,
	ReferralPreviewDocument,
	SharedQuestionsDocument,
	UserProfileDocument,
	UserRecordDocument,
	UserRecordCalendarDocument,
	UserReportCardPageDocument,
	UserStreakPageDocument,
	UserSweepPageDocument,
	ViewerOnboardingDocument,
]

export function invalidateAfterCall(queryClient: QueryClient) {
	return invalidateOperations(queryClient, CALL_DOCUMENTS)
}
