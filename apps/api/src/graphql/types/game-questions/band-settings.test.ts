import { describe, expect, it } from "vitest"
import { makeUser } from "../../../test/factories"
import { type ErrorResult, expectData } from "../../../test/graphql"

const SETTINGS = `
	query {
		adminBandSettings {
			__typename
			... on QueryAdminBandSettingsSuccess {
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
	mutation ($input: UpdateBandSettingInput!) {
		adminUpdateBandSetting(input: $input) {
			__typename
			... on BandSetting {
				isCustom
				autoTune
				tolerance {
					mode
					value
				}
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
	tolerance?: { mode: string; value: number } | null
	fieldErrors?: { field: string | null; message: string }[]
}

const input = (overrides: Record<string, unknown> = {}) => ({
	leagueSlug: "nfl",
	statName: "Points",
	band: 4,
	autoTune: false,
	...overrides,
})

async function update(
	as: Awaited<ReturnType<typeof makeUser>>,
	values = input(),
) {
	const data = await expectData<{ adminUpdateBandSetting: UpdateResult }>(
		UPDATE,
		{ as, variables: { input: values } },
	)
	return data.adminUpdateBandSetting
}

describe("adminBandSettings", () => {
	it("lists every generated team numeric guess for an admin", async () => {
		const admin = await makeUser({ isAdmin: true })
		const data = await expectData<{
			adminBandSettings: {
				__typename: string
				data?: { leagueSlug: string; statName: string }[]
			}
		}>(SETTINGS, { as: admin })

		expect(data.adminBandSettings.data).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ leagueSlug: "nfl", statName: "Points" }),
				expect.objectContaining({ leagueSlug: "mlb", statName: "Runs" }),
			]),
		)
	})

	it("is admins only", async () => {
		const user = await makeUser()
		const data = await expectData<{ adminBandSettings: ErrorResult }>(
			SETTINGS,
			{ as: user },
		)
		expect(data.adminBandSettings.__typename).toBe("AuthorizationError")
	})
})

describe("adminUpdateBandSetting", () => {
	it("saves a league stat's band", async () => {
		const admin = await makeUser({ isAdmin: true })
		expect(await update(admin)).toEqual({
			__typename: "BandSetting",
			isCustom: true,
			autoTune: false,
			tolerance: { mode: "absolute", value: 4 },
		})
	})

	it("is admins only", async () => {
		const user = await makeUser()
		expect((await update(user)).__typename).toBe("AuthorizationError")
	})

	it("rejects a band under 1", async () => {
		const admin = await makeUser({ isAdmin: true })
		const result = await update(admin, input({ band: 0 }))
		expect(result.__typename).toBe("ValidationError")
		expect(result.fieldErrors?.[0]?.field).toBe("band")
	})

	it("only takes stats a team numeric guess is generated for", async () => {
		const admin = await makeUser({ isAdmin: true })
		const result = await update(admin, input({ statName: "Passing Yards" }))
		expect(result.__typename).toBe("NotFoundError")
	})
})
