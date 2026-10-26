import { describe, expect, it } from "vitest"
import {
	makeDraftEntry,
	makeLeague,
	makePlayer,
	makePrompt,
	makeRedraftPrompt,
	makeStint,
	makeTeam,
	makeUser,
} from "../../../test/factories"
import { expectData } from "../../../test/graphql"

// The top of the 2003 NBA class, with Detroit holding the second pick and
// Ben Wallace's kind of player (undrafted that year) in the pool too.
async function class2003() {
	const league = await makeLeague({ slug: "nba", abbreviation: "NBA" })
	const cavs = await makeTeam({
		leagueId: league.id,
		name: "Cleveland Cavaliers",
	})
	const pistons = await makeTeam({
		leagueId: league.id,
		name: "Detroit Pistons",
	})
	const prompt = await makeRedraftPrompt(league.id, 2003)
	const names = [
		"LeBron James",
		"Darko Miličić",
		"Carmelo Anthony",
		"Chris Bosh",
		"Dwyane Wade",
		"Chris Kaman",
	]
	const drafted = []
	for (const [i, name] of names.entries()) {
		const player = await makePlayer({ name })
		const team = i === 1 ? pistons : cavs
		await makeStint(player.id, team.id, {
			score: name === "Darko Miličić" ? 1 : 100 - i,
		})
		await makeDraftEntry({
			leagueId: league.id,
			year: 2003,
			overall: i + 1,
			teamId: team.id,
			teamName: i === 1 ? "Detroit Pistons" : "Cleveland Cavaliers",
			playerId: player.id,
			playerName: name,
		})
		drafted.push(player)
	}
	const undrafted = await makePlayer({ name: "Udonis Haslem" })
	await makeStint(undrafted.id, cavs.id, { score: 50 })
	await makeDraftEntry({
		leagueId: league.id,
		year: 2003,
		playerId: undrafted.id,
		playerName: undrafted.name,
	})
	return { league, prompt, drafted, undrafted }
}

const CREATE = /* GraphQL */ `
	mutation Create($input: CreateRedraftInput!) {
		createRedraft(input: $input) {
			__typename
			... on PostPayload { post { id } }
			... on ValidationError { message }
		}
	}
`

const POST = /* GraphQL */ `
	query Post($id: ID!) {
		post(id: $id) {
			__typename
			sharePath
			... on RedraftPost {
				prompt {
					code
					draftYear
					answerCount
					lengths { count label isDefault }
					consensus { slot player { name } originalOverall sharePercent }
				}
				picks {
					slot
					player { name }
					slotTeamName
					slotTeam { name }
					originalOverall
					sharePercent
				}
			}
		}
	}
`

type PostData = {
	post: {
		__typename: string
		sharePath: string | null
		prompt: {
			code: string
			draftYear: number
			answerCount: number
			lengths: { count: number; label: string; isDefault: boolean }[]
			consensus: {
				slot: number
				player: { name: string }
				originalOverall: number | null
				sharePercent: number
			}[]
		}
		picks: {
			slot: number
			player: { name: string }
			slotTeamName: string | null
			slotTeam: { name: string } | null
			originalOverall: number | null
			sharePercent: number
		}[]
	} | null
}

describe("redrafts over GraphQL", () => {
	it("creates one and reads each slot's team, where the player really went and the crowd's share", async () => {
		const { prompt, drafted, undrafted } = await class2003()
		const author = await makeUser({ username: "hindsight" })
		const [lebron, darko, melo, bosh, wade] = drafted
		if (!lebron || !darko || !melo || !bosh || !wade) throw new Error("class")
		const result = await expectData<{
			createRedraft: { __typename: string; post?: { id: string } }
		}>(CREATE, {
			as: author,
			variables: {
				input: {
					promptId: prompt.id,
					playerIds: [lebron.id, wade.id, melo.id, bosh.id, undrafted.id],
				},
			},
		})
		expect(result.createRedraft.__typename).toBe("PostPayload")

		const data = await expectData<PostData>(POST, {
			as: author,
			variables: { id: result.createRedraft.post?.id },
		})
		expect(data.post).toMatchObject({
			__typename: "RedraftPost",
			sharePath: `/redraft/${prompt.code}/hindsight`,
			prompt: { draftYear: 2003, answerCount: 1 },
		})
		expect(
			data.post?.picks.map((pick) => [
				pick.slot,
				pick.player.name,
				pick.slotTeamName,
				pick.originalOverall,
				pick.sharePercent,
			]),
		).toEqual([
			[1, "LeBron James", "Cleveland Cavaliers", 1, 100],
			[2, "Dwyane Wade", "Detroit Pistons", 5, 100],
			[3, "Carmelo Anthony", "Cleveland Cavaliers", 3, 100],
			[4, "Chris Bosh", "Cleveland Cavaliers", 4, 100],
			[5, "Udonis Haslem", "Cleveland Cavaliers", null, 100],
		])
		expect(data.post?.picks[1]?.slotTeam?.name).toBe("Detroit Pistons")
		// A six-pick class in a league called "nba": Top 5 and the first round,
		// which is the default once the lottery doesn't fit.
		expect(data.post?.prompt.lengths).toEqual([
			{ count: 5, label: "Top 5", isDefault: false },
			{ count: 6, label: "First round", isDefault: true },
		])
		expect(data.post?.prompt.consensus.map((pick) => pick.player.name)).toEqual(
			[
				"LeBron James",
				"Dwyane Wade",
				"Carmelo Anthony",
				"Chris Bosh",
				"Udonis Haslem",
			],
		)
	})

	it("keeps each kind's prompts to its own lookups", async () => {
		const { league, prompt } = await class2003()
		await makePrompt({
			leagueId: league.id,
			code: prompt.code,
			title: "Rushmore",
		})

		const data = await expectData<{
			prompt: { __typename: string } | null
			redraftPrompt: { __typename: string; title: string } | null
			searchPrompts: { __typename: string }[]
		}>(
			/* GraphQL */ `
				query Lookups($code: String!) {
					prompt(code: $code) { __typename }
					redraftPrompt(code: $code) { __typename title }
					searchPrompts { __typename }
				}
			`,
			{ variables: { code: prompt.code } },
		)
		expect(data.prompt?.__typename).toBe("RushmorePrompt")
		expect(data.redraftPrompt?.__typename).toBe("RedraftPrompt")
		expect(data.searchPrompts.map((p) => p.__typename)).toEqual([
			"RushmorePrompt",
		])
	})

	it("finds a class by year, league or a player in it, and lists its pool best careers first", async () => {
		const { prompt } = await class2003()
		const other = await makeLeague({ slug: "nhl", abbreviation: "NHL" })
		await makeRedraftPrompt(other.id, 2003)

		const search = async (query: string) =>
			(
				await expectData<{ redraftClasses: { code: string }[] }>(
					/* GraphQL */ `
						query Classes($query: String) {
							redraftClasses(query: $query) { code }
						}
					`,
					{ variables: { query } },
				)
			).redraftClasses.map((c) => c.code)
		expect(await search("2003")).toHaveLength(2)
		expect(await search("nba 2003")).toEqual([prompt.code])
		expect(await search("lebron")).toEqual([prompt.code])
		// Part of a year, as it's typed.
		expect(await search("nba 20")).toEqual([prompt.code])
		expect(await search("nba 03")).toEqual([prompt.code])
		expect(await search("19")).toEqual([])
		const inLeague = await expectData<{ redraftClasses: { code: string }[] }>(
			/* GraphQL */ `
				query Classes($leagueId: ID) {
					redraftClasses(leagueId: $leagueId) { code }
				}
			`,
			{ variables: { leagueId: other.id } },
		)
		expect(inLeague.redraftClasses.map((c) => c.code)).not.toContain(
			prompt.code,
		)

		const pool = await expectData<{
			redraftPool: { player: { name: string }; overall: number | null }[]
		}>(
			/* GraphQL */ `
				query Pool($promptId: ID!) {
					redraftPool(promptId: $promptId, first: 3) {
						player { name }
						overall
					}
				}
			`,
			{ variables: { promptId: prompt.id } },
		)
		expect(pool.redraftPool).toEqual([
			{ player: { name: "LeBron James" }, overall: 1 },
			{ player: { name: "Carmelo Anthony" }, overall: 3 },
			{ player: { name: "Chris Bosh" }, overall: 4 },
		])
	})
})
