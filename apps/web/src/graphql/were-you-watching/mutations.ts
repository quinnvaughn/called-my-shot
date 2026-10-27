import type { QueryClient } from "@tanstack/react-query"
import { GroupArcadeWeekDocument } from "#/graphql/arcade/queries"
import { graphql } from "#/graphql/generated"
import { invalidateOperations } from "#/graphql/query-options"
import {
	AdminWatchQuizDocument,
	GroupWatchRecentDocument,
	WatchHubDocument,
	WatchQuizByCodeDocument,
	WatchTeamQuizDocument,
	WatchTeamsDocument,
	WatchViewerGroupsDocument,
} from "./queries"

// Starts the run and puts the first question on the clock. Pressing it
// again changes nothing.
export const StartWatchQuizDocument = graphql(`
	mutation StartWatchQuiz($quizId: ID!) {
		startWatchQuiz(quizId: $quizId) {
			__typename
			... on WatchPlay {
				...WatchPlay_play @unmask
			}
			... on NotFoundError {
				message
			}
		}
	}
`)

export const NextWatchQuestionDocument = graphql(`
	mutation NextWatchQuestion($quizId: ID!) {
		nextWatchQuestion(quizId: $quizId) {
			__typename
			... on WatchPlay {
				...WatchPlay_play @unmask
			}
			... on NotFoundError {
				message
			}
		}
	}
`)

// A null choice is the clock running out.
export const AnswerWatchQuestionDocument = graphql(`
	mutation AnswerWatchQuestion($quizId: ID!, $index: Int!, $choice: Int) {
		answerWatchQuestion(quizId: $quizId, index: $index, choice: $choice) {
			__typename
			... on WatchPlay {
				...WatchPlay_play @unmask
			}
			... on ValidationError {
				fieldErrors {
					field
					message
				}
			}
			... on NotFoundError {
				message
			}
		}
	}
`)

export const ReportWatchHiddenDocument = graphql(`
	mutation ReportWatchHidden($quizId: ID!) {
		reportWatchHidden(quizId: $quizId)
	}
`)

// Saves a run played before signing up.
export const ImportWatchQuizAnswersDocument = graphql(`
	mutation ImportWatchQuizAnswers(
		$quizId: ID!
		$answers: [WatchGuestAnswer!]!
		$clean: Boolean!
	) {
		importWatchQuizAnswers(quizId: $quizId, answers: $answers, clean: $clean) {
			__typename
			... on WatchPlay {
				status
			}
		}
	}
`)

export const ResetMyWatchPlayDocument = graphql(`
	mutation ResetMyWatchPlay($quizId: ID!) {
		resetMyWatchPlay(quizId: $quizId) {
			__typename
		}
	}
`)

export const RebuildWatchQuizDocument = graphql(`
	mutation RebuildWatchQuiz($quizId: ID!, $force: Boolean) {
		rebuildWatchQuiz(quizId: $quizId, force: $force) {
			__typename
			... on ValidationError {
				fieldErrors {
					message
				}
			}
		}
	}
`)

export function invalidateWatchQuiz(queryClient: QueryClient) {
	return invalidateOperations(queryClient, [
		WatchTeamQuizDocument,
		WatchQuizByCodeDocument,
		WatchTeamsDocument,
		WatchHubDocument,
		WatchViewerGroupsDocument,
		GroupWatchRecentDocument,
		GroupArcadeWeekDocument,
		AdminWatchQuizDocument,
	])
}
