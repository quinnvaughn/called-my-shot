import { graphql } from "#/graphql/generated"
import { gqlQueryOptions } from "#/graphql/query-options"

// A choice on a question. Players carry their headshot.
export const WatchOptionFragment = graphql(`
	fragment WatchOption_option on WatchOption {
		label
		player {
			id
			name
			headshotUrl
		}
	}
`)

// One player's run on a quiz. Spread with @unmask: the game components read
// it as plain props.
export const WatchPlayFragment = graphql(`
	fragment WatchPlay_play on WatchPlay {
		status
		correctCount
		total
		seconds
		clean
		resultCode
		rank
		current {
			index
			prompt
			msLeft
			options {
				...WatchOption_option @unmask
			}
		}
		answered {
			index
			prompt
			choice
			answer
			correct
			timedOut
			seconds
			reveal
			options {
				...WatchOption_option @unmask
			}
		}
	}
`)

export const WatchQuizFragment = graphql(`
	fragment WatchQuiz_quiz on WatchQuiz {
		id
		code
		gameStartsAt
		questionCount
		secondsPerQuestion
		live
		playerCount
		league {
			id
			slug
			abbreviation
		}
		team {
			...Team_team @unmask
		}
		opponent {
			...Team_team @unmask
		}
	}
`)

export const WatchBoardRowFragment = graphql(`
	fragment WatchBoardRow_row on WatchBoardRow {
		rank
		correct
		seconds
		clean
		user {
			id
			username
			name
			avatarUrl
		}
	}
`)

export const WatchTeamQuizDocument = graphql(`
	query WatchTeamQuiz($leagueSlug: String!, $teamSlug: String!) {
		watchTeamQuiz(leagueSlug: $leagueSlug, teamSlug: $teamSlug) {
			status
			league {
				id
				slug
				abbreviation
			}
			team {
				...Team_team @unmask
			}
			quiz {
				...WatchQuiz_quiz @unmask
				viewerPlay {
					...WatchPlay_play @unmask
				}
				board(first: 25) {
					...WatchBoardRow_row @unmask
				}
			}
		}
	}
`)

export const watchTeamQuizQuery = (leagueSlug: string, teamSlug: string) =>
	gqlQueryOptions(WatchTeamQuizDocument, { leagueSlug, teamSlug })

// One quiz by its code, current or replaced, with the sharer a result link
// names when the result is really theirs.
export const WatchQuizByCodeDocument = graphql(`
	query WatchQuizByCode(
		$leagueSlug: String!
		$teamSlug: String!
		$code: String!
		$by: String!
		$result: String!
		$hasBy: Boolean!
	) {
		watchQuizByCode(leagueSlug: $leagueSlug, teamSlug: $teamSlug, code: $code) {
			...WatchQuiz_quiz @unmask
			board(first: 25) {
				...WatchBoardRow_row @unmask
			}
			sharer(username: $by, result: $result) @include(if: $hasBy) {
				id
				username
				name
				avatarUrl
			}
		}
	}
`)

export const watchQuizByCodeQuery = (
	leagueSlug: string,
	teamSlug: string,
	code: string,
	share?: { result: string; by: string | undefined },
) =>
	gqlQueryOptions(WatchQuizByCodeDocument, {
		leagueSlug,
		teamSlug,
		code,
		by: share?.by ?? "",
		result: share?.result ?? "",
		hasBy: !!share?.by,
	})

// Every team in a league and where its quiz stands, for picking one.
export const WatchTeamsDocument = graphql(`
	query WatchTeams($leagueSlug: String!) {
		watchTeams(leagueSlug: $leagueSlug) {
			status
			team {
				...Team_team @unmask
			}
			quiz {
				id
				gameStartsAt
				questionCount
				opponent {
					...Team_team @unmask
				}
				viewerRun {
					finished
					correct
				}
			}
		}
	}
`)

export const watchTeamsQuery = (leagueSlug: string) =>
	gqlQueryOptions(WatchTeamsDocument, { leagueSlug })

// The viewer's favorite teams' quizzes, for the hub. Empty signed out.
export const WatchHubDocument = graphql(`
	query WatchHub {
		watchHub {
			status
			league {
				id
				slug
				abbreviation
			}
			team {
				...Team_team @unmask
			}
			quiz {
				...WatchQuiz_quiz @unmask
				viewerRun {
					finished
					correct
				}
			}
		}
	}
`)

export const watchHubQuery = gqlQueryOptions(WatchHubDocument, {})

// One question for a signed-out player. Their clock runs in the browser.
export const WatchGuestQuestionDocument = graphql(`
	query WatchGuestQuestion($quizId: ID!, $index: Int!) {
		watchGuestQuestion(quizId: $quizId, index: $index) {
			__typename
			... on WatchServedQuestion {
				index
				prompt
				msLeft
				options {
					...WatchOption_option @unmask
				}
			}
			... on NotFoundError {
				message
			}
		}
	}
`)

export const JudgeWatchGuestAnswerDocument = graphql(`
	query JudgeWatchGuestAnswer(
		$quizId: ID!
		$index: Int!
		$choice: Int
		$ms: Int!
	) {
		judgeWatchGuestAnswer(
			quizId: $quizId
			index: $index
			choice: $choice
			ms: $ms
		) {
			__typename
			... on WatchAnsweredQuestion {
				index
				prompt
				choice
				answer
				correct
				timedOut
				seconds
				reveal
				options {
					...WatchOption_option @unmask
				}
			}
			... on NotFoundError {
				message
			}
		}
	}
`)

export const GroupWatchRecentDocument = graphql(`
	query GroupWatchRecent($groupId: ID!) {
		group(id: $groupId) {
			id
			watchRecent {
				quiz {
					...WatchQuiz_quiz @unmask
				}
				members {
					status
					correct
					seconds
					clean
					user {
						id
						username
						name
						avatarUrl
					}
				}
			}
		}
	}
`)

export const groupWatchRecentQuery = (groupId: string) =>
	gqlQueryOptions(GroupWatchRecentDocument, { groupId })

// The viewer's groups with how many members have taken one quiz, for the
// next steps under a finished run.
export const WatchViewerGroupsDocument = graphql(`
	query WatchViewerGroups($quizId: ID!) {
		myGroups {
			id
			name
			logoUrl
			myInvite {
				id
				code
			}
			watchQuizBoard(quizId: $quizId) {
				members {
					status
				}
			}
		}
	}
`)

export const watchViewerGroupsQuery = (quizId: string) =>
	gqlQueryOptions(WatchViewerGroupsDocument, { quizId })

// A quiz with its answers. Admins only.
export const AdminWatchQuizDocument = graphql(`
	query AdminWatchQuiz($quizId: ID!) {
		adminWatchQuiz(quizId: $quizId) {
			__typename
			... on WatchQuizAdmin {
				started
				questions {
					template
					prompt
					options
					answer
					reveal
				}
			}
		}
	}
`)

export const adminWatchQuizQuery = (quizId: string) =>
	gqlQueryOptions(AdminWatchQuizDocument, { quizId })
