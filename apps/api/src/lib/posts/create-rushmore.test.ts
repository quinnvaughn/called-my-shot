import { describe, expect, it } from "vitest"
import { db } from "../../db"
import {
	makeGroup,
	makeLeague,
	makePlayer,
	makePrompt,
	makeStint,
	makeTeam,
	makeUser,
} from "../../test/factories"
import { AuthorizationError, ValidationError } from "../errors"
import { createRushmore } from "./create-rushmore"
import { updateRushmore } from "./update-rushmore"

async function franchise(poolSize = 5) {
	const league = await makeLeague()
	const team = await makeTeam({ leagueId: league.id })
	const prompt = await makePrompt({ leagueId: league.id, teamId: team.id })
	const players = []
	for (let i = 0; i < poolSize; i++) {
		const player = await makePlayer()
		await makeStint(player.id, team.id, { score: poolSize - i })
		players.push(player)
	}
	return { league, team, prompt, players }
}

const picksOf = (players: { id: string }[]) =>
	players.slice(0, 4).map((player) => player.id)

describe("createRushmore", () => {
	it("writes the post, its four picks in order, and its tags", async () => {
		const { league, team, prompt, players } = await franchise()
		const author = await makeUser()
		const post = await createRushmore(author, {
			promptId: prompt.id,
			body: "The four.",
			playerIds: picksOf(players),
		})

		const picks = await db.query.rushmorePicks.findMany({
			where: { postId: post.id },
			orderBy: { position: "asc" },
		})
		expect(picks.map((pick) => pick.playerId)).toEqual(
			players.slice(0, 4).map((player) => player.id),
		)
		expect(picks.map((pick) => pick.position)).toEqual([0, 1, 2, 3])

		const tags = await db.query.postTags.findMany({
			where: { postId: post.id },
		})
		expect(
			tags
				.filter((tag) => tag.role === "subject")
				.map((tag) => tag.spaceId)
				.sort(),
		).toEqual([league.id, team.id].sort())
		expect(tags.filter((tag) => tag.role === "mention")).toHaveLength(4)
	})

	it("refuses a player who never played for the franchise", async () => {
		const { league, prompt, players } = await franchise()
		const rival = await makeTeam({ leagueId: league.id })
		const outsider = await makePlayer()
		await makeStint(outsider.id, rival.id)
		const picks = [...picksOf(players).slice(0, 3), outsider.id]
		await expect(
			createRushmore(await makeUser(), {
				promptId: prompt.id,
				playerIds: picks,
			}),
		).rejects.toThrow(/has to have played for the/)
	})

	it("takes anyone from any of the league's teams on a league prompt", async () => {
		const league = await makeLeague()
		const prompt = await makePrompt({ leagueId: league.id, teamId: null })
		const players = []
		for (let i = 0; i < 4; i++) {
			const team = await makeTeam({ leagueId: league.id })
			const player = await makePlayer()
			await makeStint(player.id, team.id)
			players.push(player)
		}
		await expect(
			createRushmore(await makeUser(), {
				promptId: prompt.id,
				playerIds: picksOf(players),
			}),
		).resolves.toMatchObject({ promptId: prompt.id })

		const elsewhere = await makePlayer()
		await makeStint(elsewhere.id, (await makeTeam()).id)
		await expect(
			createRushmore(await makeUser(), {
				promptId: prompt.id,
				playerIds: [...picksOf(players).slice(0, 3), elsewhere.id],
			}),
		).rejects.toThrow(/has to have played in the/)
	})

	it("takes players from any league on a prompt with no league", async () => {
		const prompt = await makePrompt({ leagueId: null, teamId: null })
		const leagues = [await makeLeague(), await makeLeague()]
		const players = []
		for (let i = 0; i < 4; i++) {
			const league = leagues[i % 2] ?? leagues[0]
			const team = await makeTeam({ leagueId: league?.id })
			const player = await makePlayer()
			await makeStint(player.id, team.id)
			players.push(player)
		}
		const post = await createRushmore(await makeUser(), {
			promptId: prompt.id,
			playerIds: picksOf(players),
		})

		const tags = await db.query.postTags.findMany({
			where: { postId: post.id, spaceKind: "league" },
		})
		expect(tags.map((tag) => tag.spaceId).sort()).toEqual(
			leagues.map((league) => league.id).sort(),
		)
		expect(tags.every((tag) => tag.role === "mention")).toBe(true)
	})

	it("holds a prompt's positions and years to the stints that fit", async () => {
		const league = await makeLeague()
		const team = await makeTeam({ leagueId: league.id })
		const prompt = await makePrompt({
			leagueId: league.id,
			teamId: team.id,
			positions: ["PG", "SG"],
			fromYear: 2010,
			toYear: 2019,
		})
		const guards = []
		for (let i = 0; i < 4; i++) {
			const player = await makePlayer()
			await makeStint(player.id, team.id, {
				positions: ["PG"],
				firstSeason: 2005,
				lastSeason: 2012,
			})
			guards.push(player)
		}
		await expect(
			createRushmore(await makeUser(), {
				promptId: prompt.id,
				playerIds: picksOf(guards),
			}),
		).resolves.toMatchObject({ promptId: prompt.id })

		const center = await makePlayer()
		await makeStint(center.id, team.id, {
			positions: ["C"],
			firstSeason: 2012,
			lastSeason: 2016,
		})
		const tooEarly = await makePlayer()
		await makeStint(tooEarly.id, team.id, {
			positions: ["SG"],
			firstSeason: 1990,
			lastSeason: 2000,
		})
		for (const outsider of [center, tooEarly]) {
			await expect(
				createRushmore(await makeUser(), {
					promptId: prompt.id,
					playerIds: [...picksOf(guards).slice(0, 3), outsider.id],
				}),
			).rejects.toThrow(/at PG or SG, between 2010 and 2019/)
		}
	})

	it("needs four different players", async () => {
		const { prompt, players } = await franchise()
		const [a, b, c] = players as [
			(typeof players)[0],
			(typeof players)[0],
			(typeof players)[0],
		]
		await expect(
			createRushmore(await makeUser(), {
				promptId: prompt.id,
				playerIds: [a, b, c, a].map((player) => player.id),
			}),
		).rejects.toBeInstanceOf(ValidationError)
		await expect(
			createRushmore(await makeUser(), {
				promptId: prompt.id,
				playerIds: picksOf(players).slice(0, 3),
			}),
		).rejects.toBeInstanceOf(ValidationError)
	})

	it("only posts into a group its author is in", async () => {
		const { prompt, players } = await franchise()
		const group = await makeGroup({ admin: await makeUser() })
		await expect(
			createRushmore(await makeUser(), {
				promptId: prompt.id,
				groupId: group.id,
				playerIds: picksOf(players),
			}),
		).rejects.toBeInstanceOf(AuthorizationError)
	})

	it("allows one public answer and one per group, per prompt", async () => {
		const { prompt, players } = await franchise()
		const author = await makeUser()
		const group = await makeGroup({ admin: author })
		const input = { promptId: prompt.id, playerIds: picksOf(players) }

		await createRushmore(author, input)
		await expect(createRushmore(author, input)).rejects.toThrow(
			"You already have a Rushmore for this.",
		)

		await createRushmore(author, { ...input, groupId: group.id })
		await expect(
			createRushmore(author, { ...input, groupId: group.id }),
		).rejects.toThrow("You already have a Rushmore for this in that group.")

		// Someone else answering the same prompt is their own answer.
		await expect(createRushmore(await makeUser(), input)).resolves.toBeTruthy()
	})
})

describe("updateRushmore", () => {
	it("changes the body and marks it edited", async () => {
		const { prompt, players } = await franchise()
		const author = await makeUser()
		const post = await createRushmore(author, {
			promptId: prompt.id,
			playerIds: picksOf(players),
		})

		const updated = await updateRushmore(author, {
			postId: post.id,
			body: "Changed my mind on the words.",
		})
		expect(updated.body).toBe("Changed my mind on the words.")
		expect(updated.editedAt).not.toBeNull()
	})

	it("is only the author's to edit", async () => {
		const { prompt, players } = await franchise()
		const post = await createRushmore(await makeUser(), {
			promptId: prompt.id,
			playerIds: picksOf(players),
		})
		await expect(
			updateRushmore(await makeUser(), { postId: post.id, body: "Mine now" }),
		).rejects.toBeInstanceOf(AuthorizationError)
	})
})
