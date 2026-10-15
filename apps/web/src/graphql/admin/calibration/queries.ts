import { graphql } from "#/graphql/generated"
import { gqlQueryOptions } from "#/graphql/query-options"

// Lines tab.
export const AdminLineSettingsDocument = graphql(`
	query AdminLineSettings {
		adminLineSettings {
			__typename
			... on QueryAdminLineSettingsSuccess {
				data {
					leagueSlug
					templateId
					statName
					isCustom
					autoTune
					tunedAt
					line {
						shade
						minLine
						minGames
					}
					defaultLine {
						shade
						minLine
						minGames
					}
					setByGameModel
					calibration {
						resolved
						overRate
						averageLine
						averageBlendedMean
						outsideTarget
					}
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

export const adminLineSettingsQuery = gqlQueryOptions(
	AdminLineSettingsDocument,
	{},
)

// Bands tab.
export const AdminBandSettingsDocument = graphql(`
	query AdminBandSettings {
		adminBandSettings {
			__typename
			... on QueryAdminBandSettingsSuccess {
				data {
					leagueSlug
					templateId
					statName
					isCustom
					autoTune
					tunedAt
					tolerance {
						mode
						value
					}
					defaultTolerance {
						mode
						value
					}
					calibration {
						samples
						hitRate
						suggestedBand
						targetHitRate
						outsideTarget
						callerCalls
						callerHitRate
					}
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

export const adminBandSettingsQuery = gqlQueryOptions(
	AdminBandSettingsDocument,
	{},
)

// Leaders tab.
export const AdminLeaderLossSettingsDocument = graphql(`
	query AdminLeaderLossSettings {
		adminLeaderLossSettings {
			__typename
			... on QueryAdminLeaderLossSettingsSuccess {
				data {
					leagueSlug
					templateId
					statName
					lossRate
					defaultLossRate
					isCustom
					autoTune
					tunedAt
					calibration {
						resolved
						favoriteHitRate
						blendedHitRate
						suggestedLossRate
						callerPicks
						callerHitRate
					}
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

export const adminLeaderLossSettingsQuery = gqlQueryOptions(
	AdminLeaderLossSettingsDocument,
	{},
)

// Titles tab.
export const AdminTitleLossSettingsDocument = graphql(`
	query AdminTitleLossSettings {
		adminTitleLossSettings {
			__typename
			... on QueryAdminTitleLossSettingsSuccess {
				data {
					leagueSlug
					awardName
					lossRate
					defaultLossRate
					isCustom
					autoTune
					tunedAt
					calibration {
						resolved
						bestRecordHitRate
						blendedHitRate
						suggestedLossRate
						callerPicks
						callerHitRate
					}
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

export const adminTitleLossSettingsQuery = gqlQueryOptions(
	AdminTitleLossSettingsDocument,
	{},
)
