import { graphql } from "#/graphql/generated"

// A team as it's drawn anywhere it appears: badge, logo, name. Every document
// that shows a team spreads this instead of listing the fields. Spread it with
// `@unmask` - a team is a leaf the whole app reads as plain props (TeamBadge,
// ImageTeam, the game and series blocks), so masking it would only mean an
// unwrap at every one of those reads.
export const TeamFieldsFragment = graphql(`
	fragment Team_team on Team {
		id
		name
		abbreviation
		color
		logoUrl
	}
`)
