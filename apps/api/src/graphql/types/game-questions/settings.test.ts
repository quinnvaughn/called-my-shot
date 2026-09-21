import { describe, expect, it } from "vitest"
import { makeUser } from "../../../test/factories"
import { type ErrorResult, expectData } from "../../../test/graphql"

// One admin settings page, as the shared admin definition registers it.
type Page = {
	name: string
	key: string
	// The fields the row's own value is read back through.
	valueSelection: string
	input: Record<string, unknown>
	// What saving `input` reads back, beyond isCustom.
	saved: Record<string, unknown>
	listed: Record<string, string>[]
	invalid: { overrides: Record<string, unknown>; field: string }
	unknown: Record<string, unknown>
}

const PAGES: Page[] = [
	{
		name: "Band",
		key: "statName",
		valueSelection: "autoTune tolerance { mode value }",
		input: { leagueSlug: "nfl", statName: "Points", band: 4, autoTune: false },
		saved: { autoTune: false, tolerance: { mode: "absolute", value: 4 } },
		listed: [
			{ leagueSlug: "nfl", statName: "Points" },
			{ leagueSlug: "mlb", statName: "Runs" },
		],
		invalid: { overrides: { band: 0 }, field: "band" },
		unknown: { statName: "Passing Yards" },
	},
	{
		name: "LeaderLoss",
		key: "statName",
		valueSelection: "autoTune lossRate",
		input: {
			leagueSlug: "nfl",
			statName: "Sacks",
			lossRate: 0.2,
			autoTune: false,
		},
		saved: { autoTune: false, lossRate: 0.2 },
		listed: [
			{ leagueSlug: "nba", statName: "Rebounds" },
			{ leagueSlug: "nfl", statName: "Sacks" },
		],
		invalid: { overrides: { lossRate: 1.5 }, field: "lossRate" },
		unknown: { statName: "Passing Yards" },
	},
	{
		name: "Line",
		key: "templateId",
		valueSelection: "line { shade minLine minGames }",
		input: {
			leagueSlug: "mlb",
			templateId: "batter-hits",
			shade: 1,
			minLine: 1.5,
			minGames: 15,
			autoTune: false,
		},
		saved: { line: { shade: 1, minLine: 1.5, minGames: 15 } },
		listed: [
			{ leagueSlug: "mlb", templateId: "batter-hits" },
			{ leagueSlug: "nba", templateId: "top-scorer-points" },
		],
		invalid: { overrides: { minLine: 2 }, field: "minLine" },
		unknown: { leagueSlug: "nba", templateId: "top-scorer-points-duel" },
	},
	{
		name: "TitleLoss",
		key: "awardName",
		valueSelection: "autoTune lossRate",
		input: {
			leagueSlug: "nfl",
			awardName: "Super Bowl",
			lossRate: 0.2,
			autoTune: false,
		},
		saved: { autoTune: false, lossRate: 0.2 },
		listed: [
			{ leagueSlug: "nfl", awardName: "Super Bowl" },
			{ leagueSlug: "mlb", awardName: "Pennant" },
		],
		invalid: { overrides: { lossRate: 0 }, field: "lossRate" },
		unknown: { awardName: "MVP" },
	},
]

type UpdateResult = ErrorResult &
	Record<string, unknown> & {
		fieldErrors?: { field: string | null; message: string }[]
	}

describe.each(PAGES)("$name settings", (page) => {
	const list = `admin${page.name}Settings`
	const mutation = `adminUpdate${page.name}Setting`

	async function update(
		as: Awaited<ReturnType<typeof makeUser>>,
		overrides: Record<string, unknown> = {},
	) {
		const data = await expectData<Record<string, UpdateResult>>(
			`mutation ($input: Update${page.name}SettingInput!) {
				${mutation}(input: $input) {
					__typename
					... on ${page.name}Setting { isCustom ${page.valueSelection} }
					... on ValidationError { fieldErrors { field message } }
					... on AuthorizationError { message }
					... on NotFoundError { message }
				}
			}`,
			{ as, variables: { input: { ...page.input, ...overrides } } },
		)
		return data[mutation] as UpdateResult
	}

	async function listAs(as: Awaited<ReturnType<typeof makeUser>>) {
		const data = await expectData<
			Record<string, ErrorResult & { data?: Record<string, string>[] }>
		>(
			`query {
				${list} {
					__typename
					... on QueryAdmin${page.name}SettingsSuccess {
						data { leagueSlug ${page.key} isCustom }
					}
					... on AuthorizationError { message }
				}
			}`,
			{ as },
		)
		return data[list]
	}

	it("lists every key for an admin", async () => {
		const result = await listAs(await makeUser({ isAdmin: true }))
		expect(result?.data).toEqual(
			expect.arrayContaining(
				page.listed.map((key) => expect.objectContaining(key)),
			),
		)
	})

	it("lists for admins only", async () => {
		expect((await listAs(await makeUser()))?.__typename).toBe(
			"AuthorizationError",
		)
	})

	it("saves a key's settings", async () => {
		const admin = await makeUser({ isAdmin: true })
		expect(await update(admin)).toEqual({
			__typename: `${page.name}Setting`,
			isCustom: true,
			...page.saved,
		})
	})

	it("resets a key to its default", async () => {
		const admin = await makeUser({ isAdmin: true })
		await update(admin)
		const reset = `adminReset${page.name}Setting`
		const data = await expectData<Record<string, { isCustom?: boolean }>>(
			`mutation ($leagueSlug: String!, $key: String!) {
				${reset}(leagueSlug: $leagueSlug, ${page.key}: $key) {
					... on ${page.name}Setting { isCustom }
				}
			}`,
			{
				as: admin,
				variables: {
					leagueSlug: page.input.leagueSlug,
					key: page.input[page.key],
				},
			},
		)
		expect(data[reset]).toEqual({ isCustom: false })
	})

	it("saves for admins only", async () => {
		expect((await update(await makeUser())).__typename).toBe(
			"AuthorizationError",
		)
	})

	it("rejects an invalid value", async () => {
		const admin = await makeUser({ isAdmin: true })
		const result = await update(admin, page.invalid.overrides)
		expect(result.__typename).toBe("ValidationError")
		expect(result.fieldErrors?.[0]?.field).toBe(page.invalid.field)
	})

	it("only takes keys the page has a setting for", async () => {
		const admin = await makeUser({ isAdmin: true })
		expect((await update(admin, page.unknown)).__typename).toBe("NotFoundError")
	})
})
