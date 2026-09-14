import { describe, expect, it } from "vitest"
import { makeUser } from "../../../test/factories"
import { type ErrorResult, expectData } from "../../../test/graphql"

const SETTINGS = `
	query {
		adminLineSettings {
			__typename
			... on QueryAdminLineSettingsSuccess {
				data {
					leagueSlug
					templateId
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
	mutation ($input: UpdateLineSettingInput!) {
		adminUpdateLineSetting(input: $input) {
			__typename
			... on LineSetting {
				isCustom
				line {
					shade
					minLine
					minGames
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
	line?: { shade: number; minLine: number; minGames: number }
	fieldErrors?: { field: string | null; message: string }[]
}

const input = (overrides: Record<string, unknown> = {}) => ({
	leagueSlug: "mlb",
	templateId: "batter-hits",
	shade: 1,
	minLine: 1.5,
	minGames: 15,
	autoTune: false,
	...overrides,
})

async function update(
	as: Awaited<ReturnType<typeof makeUser>>,
	values = input(),
) {
	const data = await expectData<{ adminUpdateLineSetting: UpdateResult }>(
		UPDATE,
		{ as, variables: { input: values } },
	)
	return data.adminUpdateLineSetting
}

describe("adminLineSettings", () => {
	it("lists every generated over/under template for an admin", async () => {
		const admin = await makeUser({ isAdmin: true })
		const data = await expectData<{
			adminLineSettings: {
				__typename: string
				data?: { leagueSlug: string; templateId: string }[]
			}
		}>(SETTINGS, { as: admin })

		expect(data.adminLineSettings.data).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					leagueSlug: "mlb",
					templateId: "batter-hits",
				}),
				expect.objectContaining({
					leagueSlug: "nba",
					templateId: "top-scorer-points",
				}),
			]),
		)
	})

	it("is admins only", async () => {
		const user = await makeUser()
		const data = await expectData<{ adminLineSettings: ErrorResult }>(
			SETTINGS,
			{ as: user },
		)
		expect(data.adminLineSettings.__typename).toBe("AuthorizationError")
	})
})

describe("adminUpdateLineSetting", () => {
	it("saves a template's settings", async () => {
		const admin = await makeUser({ isAdmin: true })
		expect(await update(admin)).toEqual({
			__typename: "LineSetting",
			isCustom: true,
			line: { shade: 1, minLine: 1.5, minGames: 15 },
		})
	})

	it("is admins only", async () => {
		const user = await makeUser()
		expect((await update(user)).__typename).toBe("AuthorizationError")
	})

	it("rejects a lowest line that isn't on a half", async () => {
		const admin = await makeUser({ isAdmin: true })
		const result = await update(admin, input({ minLine: 2 }))
		expect(result.__typename).toBe("ValidationError")
		expect(result.fieldErrors?.[0]?.field).toBe("minLine")
	})

	it("only takes over/under templates", async () => {
		const admin = await makeUser({ isAdmin: true })
		const result = await update(
			admin,
			input({ leagueSlug: "nba", templateId: "top-scorer-points-duel" }),
		)
		expect(result.__typename).toBe("NotFoundError")
	})
})
