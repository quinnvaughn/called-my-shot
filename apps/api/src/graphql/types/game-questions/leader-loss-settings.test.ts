import { describe, expect, it } from "vitest"
import { makeUser } from "../../../test/factories"
import { type ErrorResult, expectData } from "../../../test/graphql"

const SETTINGS = `
	query {
		adminLeaderLossSettings {
			__typename
			... on QueryAdminLeaderLossSettingsSuccess {
				data {
					leagueSlug
					statName
					isCustom
				}
			}
			... on AuthorizationError {
				message
			}
		}
	}
`

const UPDATE = `
	mutation ($input: UpdateLeaderLossSettingInput!) {
		adminUpdateLeaderLossSetting(input: $input) {
			__typename
			... on LeaderLossSetting {
				isCustom
				autoTune
				lossRate
			}
			... on ValidationError {
				fieldErrors {
					field
					message
				}
			}
			... on AuthorizationError {
				message
			}
			... on NotFoundError {
				message
			}
		}
	}
`

type UpdateResult = ErrorResult & {
	isCustom?: boolean
	autoTune?: boolean
	lossRate?: number
	fieldErrors?: { field: string | null; message: string }[]
}

const input = (overrides: Record<string, unknown> = {}) => ({
	leagueSlug: "nfl",
	statName: "Sacks",
	lossRate: 0.2,
	autoTune: false,
	...overrides,
})

async function update(
	as: Awaited<ReturnType<typeof makeUser>>,
	values = input(),
) {
	const data = await expectData<{
		adminUpdateLeaderLossSetting: UpdateResult
	}>(UPDATE, { as, variables: { input: values } })
	return data.adminUpdateLeaderLossSetting
}

describe("adminLeaderLossSettings", () => {
	it("lists every generated game stat leader for an admin", async () => {
		const admin = await makeUser({ isAdmin: true })
		const data = await expectData<{
			adminLeaderLossSettings: {
				__typename: string
				data?: { leagueSlug: string; statName: string }[]
			}
		}>(SETTINGS, { as: admin })

		expect(data.adminLeaderLossSettings.data).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ leagueSlug: "nba", statName: "Rebounds" }),
				expect.objectContaining({ leagueSlug: "nfl", statName: "Sacks" }),
			]),
		)
	})

	it("is admins only", async () => {
		const user = await makeUser()
		const data = await expectData<{ adminLeaderLossSettings: ErrorResult }>(
			SETTINGS,
			{ as: user },
		)
		expect(data.adminLeaderLossSettings.__typename).toBe("AuthorizationError")
	})
})

describe("adminUpdateLeaderLossSetting", () => {
	it("saves a league stat's loss rate", async () => {
		const admin = await makeUser({ isAdmin: true })
		expect(await update(admin)).toEqual({
			__typename: "LeaderLossSetting",
			isCustom: true,
			autoTune: false,
			lossRate: 0.2,
		})
	})

	it("is admins only", async () => {
		const user = await makeUser()
		expect((await update(user)).__typename).toBe("AuthorizationError")
	})

	it("rejects a rate over 1", async () => {
		const admin = await makeUser({ isAdmin: true })
		const result = await update(admin, input({ lossRate: 1.5 }))
		expect(result.__typename).toBe("ValidationError")
		expect(result.fieldErrors?.[0]?.field).toBe("lossRate")
	})

	it("only takes stats a leader question is generated for", async () => {
		const admin = await makeUser({ isAdmin: true })
		const result = await update(admin, input({ statName: "Passing Yards" }))
		expect(result.__typename).toBe("NotFoundError")
	})
})
