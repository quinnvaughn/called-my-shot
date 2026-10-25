import type { QueryClient } from "@tanstack/react-query"
import { graphql } from "#/graphql/generated"
import {
	AdminBallotDocument,
	AdminBallotSearchDocument,
	AdminBallotsDocument,
	AdminDisputesDocument,
	AdminQuestionsDocument,
	AdminQueueSummaryDocument,
	AdminReportsDocument,
	AnsweredQuestionsDocument,
	BallotAttachableQuestionsDocument,
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
	GroupPreviewDocument,
	GuestPicksDocument,
	HomeDashboardDocument,
	LeagueBallotsDocument,
	LeagueGamesForWindowDocument,
	LeagueSeasonClosingSoonDocument,
	LeagueSeasonDocument,
	MyCallsDocument,
	MyCallsPageDocument,
	MyChallengesDocument,
	MyLiveCallsDocument,
	MyQuestionsDocument,
	QuestionDetailDocument,
	ReferralPreviewDocument,
	SharedQuestionsDocument,
	SitemapLeagueContentDocument,
	UserProfileDocument,
	UserStreakPageDocument,
	UserSweepPageDocument,
	ViewerOnboardingDocument,
} from "#/graphql/generated/graphql"
import { invalidateOperations } from "#/graphql/query-options"

export const CreateQuestionDocument = graphql(`
	mutation CreateQuestion($input: CreateQuestionInput!) {
		createQuestion(input: $input) {
			__typename
			... on QuestionPayload {
				question {
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
		}
	}
`)

export const ResolveQuestionDocument = graphql(`
	mutation ResolveQuestion($input: ResolveQuestionInput!) {
		resolveQuestion(input: $input) {
			__typename
			... on QuestionPayload {
				question {
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

export const FileDisputeDocument = graphql(`
	mutation FileDispute($input: FileDisputeInput!) {
		fileDispute(input: $input) {
			__typename
			... on FileDisputePayload {
				dispute {
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

export const ReportQuestionDocument = graphql(`
	mutation ReportQuestion($input: ReportQuestionInput!) {
		reportQuestion(input: $input) {
			__typename
			... on ReportQuestionPayload {
				report {
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

// Every list a new question can land in (its game, league, ballot and the
// creator's own), the counts beside them, and the get-started checklist's
// create step.
const QUESTION_CREATED_DOCUMENTS = [
	AdminBallotDocument,
	AdminBallotSearchDocument,
	AdminBallotsDocument,
	AdminQuestionsDocument,
	AdminQueueSummaryDocument,
	BallotAttachableQuestionsDocument,
	BallotByRefDocument,
	BallotEntryDocument,
	ChallengeCandidatesDocument,
	CreatedQuestionsDocument,
	GameByIdDocument,
	GameOfficialQuestionsDocument,
	GameQuestionsDocument,
	GroupBallotBoardDocument,
	GroupGameBoardDocument,
	GroupHomeDocument,
	GuestPicksDocument,
	HomeDashboardDocument,
	LeagueBallotsDocument,
	LeagueGamesForWindowDocument,
	LeagueSeasonDocument,
	LeagueSeasonClosingSoonDocument,
	MyQuestionsDocument,
	SitemapLeagueContentDocument,
	UserProfileDocument,
	ViewerOnboardingDocument,
]

export function invalidateAfterQuestionCreated(queryClient: QueryClient) {
	return invalidateOperations(queryClient, QUESTION_CREATED_DOCUMENTS)
}

// A dispute puts the question back to disputed, so every read that shows
// its status, plus the admin queue that reviews it.
const QUESTION_DISPUTED_DOCUMENTS = [
	AdminBallotDocument,
	AdminDisputesDocument,
	AdminQuestionsDocument,
	AdminQueueSummaryDocument,
	AnsweredQuestionsDocument,
	BallotAttachableQuestionsDocument,
	BallotByRefDocument,
	BallotEntryDocument,
	CallRecordDocument,
	ChallengePageDocument,
	ChallengeReceiptDocument,
	CreatedQuestionsDocument,
	GameByIdDocument,
	GameEntryDocument,
	GameOfficialQuestionsDocument,
	GameQuestionsDocument,
	GroupGameBoardDocument,
	GroupHomeDocument,
	GroupPreviewDocument,
	HomeDashboardDocument,
	LeagueBallotsDocument,
	LeagueSeasonDocument,
	LeagueSeasonClosingSoonDocument,
	MyCallsDocument,
	MyCallsPageDocument,
	MyChallengesDocument,
	MyLiveCallsDocument,
	MyQuestionsDocument,
	QuestionDetailDocument,
	ReferralPreviewDocument,
	SharedQuestionsDocument,
	UserProfileDocument,
	UserStreakPageDocument,
	UserSweepPageDocument,
]

export function invalidateAfterDispute(queryClient: QueryClient) {
	return invalidateOperations(queryClient, QUESTION_DISPUTED_DOCUMENTS)
}

// The reporter's own report on the question page, and the admin queue.
const QUESTION_REPORTED_DOCUMENTS = [
	AdminQueueSummaryDocument,
	AdminReportsDocument,
	QuestionDetailDocument,
]

export function invalidateAfterReport(queryClient: QueryClient) {
	return invalidateOperations(queryClient, QUESTION_REPORTED_DOCUMENTS)
}
