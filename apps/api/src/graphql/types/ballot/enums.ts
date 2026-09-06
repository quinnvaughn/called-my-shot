import { builder } from "../../builder"

// draft: fully editable, invisible everywhere public. published: shows up on
// every member's detail page and feed card. See ballotStatus on the ballots
// table (db/schema/ballots.ts) for the full reasoning.
export const BallotStatus = builder.enumType("BallotStatus", {
	values: {
		DRAFT: { value: "draft" },
		PUBLISHED: { value: "published" },
	},
})

export const AdminBallotSort = builder.enumType("AdminBallotSort", {
	values: {
		NAME: { value: "name" },
		STATUS: { value: "status" },
		CREATED_AT: { value: "createdAt" },
		// Only meaningful once the list is scoped to one league and season -
		// sortOrder is positional within that pair, so an unscoped list sorted
		// on it is just every league's position-1 ballot bunched together.
		SORT_ORDER: { value: "sortOrder" },
	},
})
