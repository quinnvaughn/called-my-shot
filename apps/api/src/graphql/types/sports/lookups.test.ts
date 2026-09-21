import { describe, expect, it } from "vitest"
import { expectData } from "../../../test/graphql"

// The by-id root lookups take whatever id a url carries. One that isn't a
// uuid names nothing, so it resolves null rather than reaching Postgres,
// which would reject it as a malformed uuid.

describe("by-id lookups with a malformed id", () => {
	it("resolve null", async () => {
		const data = await expectData(
			/* GraphQL */ `
				query {
					league(id: "nba") { id }
					game(id: "not-a-uuid") { id }
					user(id: "42") { id }
				}
			`,
		)
		expect(data).toEqual({ league: null, game: null, user: null })
	})
})
