import { graphql } from "#/graphql/generated"

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

export const AdminUpdateLeaderLossSettingDocument = graphql(`
	mutation AdminUpdateLeaderLossSetting($input: UpdateLeaderLossSettingInput!) {
		adminUpdateLeaderLossSetting(input: $input) {
			__typename
			... on LeaderLossSetting {
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

export const AdminResetLeaderLossSettingDocument = graphql(`
	mutation AdminResetLeaderLossSetting($leagueSlug: String!, $statName: String!) {
		adminResetLeaderLossSetting(leagueSlug: $leagueSlug, statName: $statName) {
			__typename
			... on LeaderLossSetting {
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

export const AdminUpdateTitleLossSettingDocument = graphql(`
	mutation AdminUpdateTitleLossSetting($input: UpdateTitleLossSettingInput!) {
		adminUpdateTitleLossSetting(input: $input) {
			__typename
			... on TitleLossSetting {
				leagueSlug
				awardName
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

export const AdminResetTitleLossSettingDocument = graphql(`
	mutation AdminResetTitleLossSetting($leagueSlug: String!, $awardName: String!) {
		adminResetTitleLossSetting(leagueSlug: $leagueSlug, awardName: $awardName) {
			__typename
			... on TitleLossSetting {
				leagueSlug
				awardName
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
