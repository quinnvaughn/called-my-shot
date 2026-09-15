import { graphql } from "#/graphql/generated"

export const VoidQuestionDocument = graphql(`
	mutation VoidQuestion($input: VoidQuestionInput!) {
		voidQuestion(input: $input) {
			__typename
			... on VoidQuestionPayload {
				questionId
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

export const AdminMarkQuestionVoidedDocument = graphql(`
	mutation AdminMarkQuestionVoided($input: AdminMarkQuestionVoidedInput!) {
		adminMarkQuestionVoided(input: $input) {
			__typename
			... on QuestionPayload {
				question {
					id
					status
					voidedReason
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

export const EditQuestionTitleDocument = graphql(`
	mutation EditQuestionTitle($input: EditQuestionTitleInput!) {
		editQuestionTitle(input: $input) {
			__typename
			... on QuestionPayload {
				question {
					id
					title
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

export const DeleteQuestionDocument = graphql(`
	mutation DeleteQuestion($input: DeleteQuestionInput!) {
		deleteQuestion(input: $input) {
			__typename
			... on DeleteQuestionPayload {
				questionId
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

export const AdminResolveQuestionDocument = graphql(`
	mutation AdminResolveQuestion($input: AdminResolveQuestionInput!) {
		adminResolveQuestion(input: $input) {
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

export const OverturnDisputeDocument = graphql(`
	mutation OverturnDispute($input: OverturnDisputeInput!) {
		overturnDispute(input: $input) {
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

export const UpholdDisputeDocument = graphql(`
	mutation UpholdDispute($input: UpholdDisputeInput!) {
		upholdDispute(input: $input) {
			__typename
			... on ResolutionDispute {
				id
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

export const DismissReportDocument = graphql(`
	mutation DismissReport($input: DismissReportInput!) {
		dismissReport(input: $input) {
			__typename
			... on QuestionReport {
				id
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
			... on ValidationError {
				fieldErrors {
					field
					message
				}
			}
		}
	}
`)

export const SetUserQuestionCreationEnabledDocument = graphql(`
	mutation SetUserQuestionCreationEnabled($userId: ID!, $enabled: Boolean!) {
		setUserQuestionCreationEnabled(userId: $userId, enabled: $enabled) {
			__typename
			... on User {
				id
				questionCreationEnabled
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

export const AdminUpdateLineSettingDocument = graphql(`
	mutation AdminUpdateLineSetting($input: UpdateLineSettingInput!) {
		adminUpdateLineSetting(input: $input) {
			__typename
			... on LineSetting {
				leagueSlug
				templateId
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

export const AdminResetLineSettingDocument = graphql(`
	mutation AdminResetLineSetting($leagueSlug: String!, $templateId: String!) {
		adminResetLineSetting(leagueSlug: $leagueSlug, templateId: $templateId) {
			__typename
			... on LineSetting {
				leagueSlug
				templateId
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

export const AdminUpdateBandSettingDocument = graphql(`
	mutation AdminUpdateBandSetting($input: UpdateBandSettingInput!) {
		adminUpdateBandSetting(input: $input) {
			__typename
			... on BandSetting {
				leagueSlug
				statName
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

export const AdminResetBandSettingDocument = graphql(`
	mutation AdminResetBandSetting($leagueSlug: String!, $statName: String!) {
		adminResetBandSetting(leagueSlug: $leagueSlug, statName: $statName) {
			__typename
			... on BandSetting {
				leagueSlug
				statName
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

export const SetUserVerifiedDocument = graphql(`
	mutation SetUserVerified($userId: ID!, $verified: Boolean!) {
		setUserVerified(userId: $userId, verified: $verified) {
			__typename
			... on User {
				id
				isVerifiedPundit
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

export const CreateLeagueDocument = graphql(`
	mutation CreateLeague($input: CreateLeagueInput!) {
		createLeague(input: $input) {
			__typename
			... on League {
				id
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

export const UpdateLeagueDocument = graphql(`
	mutation UpdateLeague($input: UpdateLeagueInput!) {
		updateLeague(input: $input) {
			__typename
			... on League {
				id
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

export const CreateTeamDocument = graphql(`
	mutation CreateTeam($input: CreateTeamInput!) {
		createTeam(input: $input) {
			__typename
			... on Team {
				id
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

export const UpdateTeamDocument = graphql(`
	mutation UpdateTeam($input: UpdateTeamInput!) {
		updateTeam(input: $input) {
			__typename
			... on Team {
				id
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

export const CreatePlayerDocument = graphql(`
	mutation CreatePlayer($input: CreatePlayerInput!) {
		createPlayer(input: $input) {
			__typename
			... on Player {
				id
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

export const UpdatePlayerDocument = graphql(`
	mutation UpdatePlayer($input: UpdatePlayerInput!) {
		updatePlayer(input: $input) {
			__typename
			... on Player {
				id
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

export const CreateGameDocument = graphql(`
	mutation CreateGame($input: CreateGameInput!) {
		createGame(input: $input) {
			__typename
			... on Game {
				id
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

export const UpdateGameDocument = graphql(`
	mutation UpdateGame($input: UpdateGameInput!) {
		updateGame(input: $input) {
			__typename
			... on Game {
				id
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
