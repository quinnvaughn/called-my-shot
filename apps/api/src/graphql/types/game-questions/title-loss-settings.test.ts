import { describe, expect, it } from "vitest"
import { makeUser } from "../../../test/factories"
import { type ErrorResult, expectData } from "../../../test/graphql"

const SETTINGS = `
	query {
		adminTitleLossSettings {
			__typename
			... on QueryAdminTitleLossSettingsSuccess {
				data {
					leagueSlug
					awardName
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
	mutation ($input: UpdateTitleLossSettingInput!) {
		adminUpdateTitleLossSetting(input: $input) {
			__typename
			... on TitleLossSetting {
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
	awardName: "Super Bowl",
	lossRate: 0.2,
	autoTune: false,
	...overrides,
})

async function update(
	as: Awaited<ReturnType<typeof makeUser>>,
	values = input(),
) {
	const data = await expectData<{ adminUpdateTitleLossSetting: UpdateResult }>(
		UPDATE,
		{ as, variables: { input: values } },
	)
	return data.adminUpdateTitleLossSetting
}

describe("adminTitleLossSettings", () => {
	it("lists every league's single-pick titles for an admin", async () => {
		const admin = await makeUser({ isAdmin: true })
		const data = await expectData<{
			adminTitleLossSettings: {
				__typename: string
				data?: { leagueSlug: string; awardName: string }[]
			}
		}>(SETTINGS, { as: admin })

		expect(data.adminTitleLossSettings.data).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ leagueSlug: "nfl", awardName: "Super Bowl" }),
				expect.objectContaining({ leagueSlug: "mlb", awardName: "Pennant" }),
			]),
		)
	})

	it("is admins only", async () => {
		const user = await makeUser()
		const data = await expectData<{ adminTitleLossSettings: ErrorResult }>(
			SETTINGS,
			{ as: user },
		)
		expect(data.adminTitleLossSettings.__typename).toBe("AuthorizationError")
	})
})

describe("adminUpdateTitleLossSetting", () => {
	it("saves a league title's loss rate", async () => {
		const admin = await makeUser({ isAdmin: true })
		expect(await update(admin)).toEqual({
			__typename: "TitleLossSetting",
			isCustom: true,
			autoTune: false,
			lossRate: 0.2,
		})
	})

	it("is admins only", async () => {
		const user = await makeUser()
		expect((await update(user)).__typename).toBe("AuthorizationError")
	})

	it("rejects a rate under 0.05", async () => {
		const admin = await makeUser({ isAdmin: true })
		const result = await update(admin, input({ lossRate: 0 }))
		expect(result.__typename).toBe("ValidationError")
		expect(result.fieldErrors?.[0]?.field).toBe("lossRate")
	})

	it("only takes a league's single-pick titles", async () => {
		const admin = await makeUser({ isAdmin: true })
		const result = await update(admin, input({ awardName: "MVP" }))
		expect(result.__typename).toBe("NotFoundError")
	})
})
