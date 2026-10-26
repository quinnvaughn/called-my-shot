import { describe, expect, it } from "vitest"
import { db } from "../../db"
import {
	makeDraftEntry,
	makeGroup,
	makeLeague,
	makePlayer,
	makePrompt,
	makeRedraftPrompt,
	makeTeam,
	makeUser,
} from "../../test/factories"
import { NotFoundError, ValidationError } from "../errors"
import { createRedraft } from "./create-redraft"

// A six-pick first round, plus one player who came in undrafted. The test
// league's lengths are Top 5 and the first round (6).
async function draftClass() {
	const league = await makeLeague()
	const team = await makeTeam({ leagueId: league.id })
	const prompt = await makeRedraftPrompt(league.id, 2003)
	const drafted = []
	for (let overall = 1; overall <= 6; overall++) {
		const player = await makePlayer()
		await makeDraftEntry({
			leagueId: league.id,
			year: 2003,
			overall,
			teamId: team.id,
			playerId: player.id,
			playerName: player.name,
		})
		drafted.push(player)
	}
	const undrafted = await makePlayer()
	await makeDraftEntry({
		leagueId: league.id,
		year: 2003,
		playerId: undrafted.id,
		playerName: undrafted.name,
	})
	return { league, team, prompt, drafted, undrafted }
}

const ids = (players: { id: string }[]) => players.map((player) => player.id)

describe("createRedraft", () => {
	it("writes the picks in slot order, tagged with the league and each player", async () => {
		const { league, prompt, drafted, undrafted } = await draftClass()
		const author = await makeUser()
		const order = [undrafted, ...drafted.slice(0, 4).reverse()]

		const post = await createRedraft(author, {
			promptId: prompt.id,
			playerIds: ids(order),
		})

		expect(post.kind).toBe("redraft")
		const picks = await db.query.redraftPicks.findMany({
			where: { postId: post.id },
			orderBy: { slot: "asc" },
		})
		expect(picks.map((pick) => pick.playerId)).toEqual(ids(order))
		expect(picks.map((pick) => pick.slot)).toEqual([1, 2, 3, 4, 5])
		const tags = await db.query.postTags.findMany({
			where: { postId: post.id },
		})
		expect(tags).toContainEqual(
			expect.objectContaining({
				spaceKind: "league",
				spaceId: league.id,
				role: "subject",
			}),
		)
		expect(tags.filter((tag) => tag.spaceKind === "player")).toHaveLength(5)
		expect(tags.some((tag) => tag.spaceKind === "team")).toBe(false)
	})

	it("only takes one of the class's lengths", async () => {
		const { prompt, drafted } = await draftClass()
		await expect(
			createRedraft(await makeUser(), {
				promptId: prompt.id,
				playerIds: ids(drafted.slice(0, 4)),
			}),
		).rejects.toBeInstanceOf(ValidationError)
		const firstRound = await createRedraft(await makeUser(), {
			promptId: prompt.id,
			playerIds: ids(drafted),
		})
		expect(firstRound.kind).toBe("redraft")
	})

	it("refuses a player from another class", async () => {
		const { league, prompt, drafted } = await draftClass()
		const later = await makePlayer()
		await makeDraftEntry({
			leagueId: league.id,
			year: 2004,
			overall: 1,
			playerId: later.id,
			playerName: later.name,
		})
		await expect(
			createRedraft(await makeUser(), {
				promptId: prompt.id,
				playerIds: [later.id, ...ids(drafted.slice(0, 4))],
			}),
		).rejects.toThrow("2003 class")
	})

	it("allows one public redraft per class and one per group", async () => {
		const { prompt, drafted } = await draftClass()
		const author = await makeUser()
		const group = await makeGroup({ admin: author })
		const playerIds = ids(drafted.slice(0, 5))
		await createRedraft(author, { promptId: prompt.id, playerIds })
		await expect(
			createRedraft(author, { promptId: prompt.id, playerIds }),
		).rejects.toThrow("already have a redraft of this class.")
		await createRedraft(author, {
			promptId: prompt.id,
			groupId: group.id,
			playerIds,
		})
		await expect(
			createRedraft(author, {
				promptId: prompt.id,
				groupId: group.id,
				playerIds,
			}),
		).rejects.toThrow("in that group")
	})

	it("treats a Rushmore prompt as no class at all", async () => {
		const { drafted, league } = await draftClass()
		const rushmore = await makePrompt({ leagueId: league.id })
		await expect(
			createRedraft(await makeUser(), {
				promptId: rushmore.id,
				playerIds: ids(drafted.slice(0, 5)),
			}),
		).rejects.toBeInstanceOf(NotFoundError)
	})
})
