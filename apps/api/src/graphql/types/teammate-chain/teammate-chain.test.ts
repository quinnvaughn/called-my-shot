import { describe, expect, it } from "vitest"
import { db } from "../../../db"
import {
	playerTeamSeasons,
	teammateChainPuzzles,
	teammateChainResults,
	type User,
} from "../../../db/schema"
import { addArcadeDays, arcadeDay } from "../../../lib/arcade/day"
import {
	makeGroup,
	makeLeague,
	makePlayer,
	makeStint,
	makeTeam,
	makeUser,
} from "../../../test/factories"
import { execute, expectData } from "../../../test/graphql"

// Teammate Chain: connect two players through teammates, a pair a day,
// played signed in or out, with rarity against everyone else's routes and
// a board inside groups.

async function setup(day = arcadeDay(new Date())) {
	const league = await makeLeague({ slug: "nba" })
	const chi = await makeTeam({ leagueId: league.id, abbreviation: "CHI" })
	const bos = await makeTeam({ leagueId: league.id, abbreviation: "BOS" })
	const lal = await makeTeam({ leagueId: league.id, abbreviation: "LAL" })
	const other = await makeTeam({ abbreviation: "OUT" })
	const [start, a, b, c, target, outsider] = await Promise.all(
		[
			"Start Guy",
			"Alpha Guy",
			"Bravo Guy",
			"Charlie Guy",
			"Target Guy",
			"Other Guy",
		].map((name) => makePlayer({ name })),
	)
	if (!start || !a || !b || !c || !target || !outsider)
		throw new Error("players")
	// start-a CHI 1990, a-b BOS 1995, b-target LAL 2000; a second route
	// start-c CHI 1991, c-b BOS 1996. start played for LAL in 1999 too, a
	// season before target got there.
	const seasons = [
		[start, chi, 1990],
		[a, chi, 1990],
		[a, bos, 1995],
		[b, bos, 1995],
		[b, lal, 2000],
		[target, lal, 2000],
		[start, chi, 1991],
		[c, chi, 1991],
		[c, bos, 1996],
		[b, bos, 1996],
		[start, lal, 1999],
		[outsider, other, 1990],
	] as const
	await db.insert(playerTeamSeasons).values(
		seasons.map(([player, team, season]) => ({
			playerId: player.id,
			teamId: team.id,
			season,
		})),
	)
	const stints = new Set<string>()
	for (const [player, team] of seasons) {
		if (stints.has(`${player.id}:${team.id}`)) continue
		stints.add(`${player.id}:${team.id}`)
		await makeStint(player.id, team.id)
	}
	const [puzzle] = await db
		.insert(teammateChainPuzzles)
		.values({
			leagueId: league.id,
			startPlayerId: start.id,
			targetPlayerId: target.id,
			par: 3,
			parRoute: [a.id, b.id],
			signature: `${start.id}:${target.id}`,
			playDate: day,
		})
		.returning()
	if (!puzzle) throw new Error("no puzzle")
	return { league, chi, bos, lal, start, a, b, c, target, outsider, puzzle }
}

const PLAY_FIELDS = `
	status
	links
	misses
	hints
	clues
	cluesLeft
	deadEnd
	seconds
	resultCode
	chain {
		player { player { id } teams { name years } }
		shared { name label current }
	}
	connection { label }
	moves { kind player { player { id } } }
	parRoute { player { player { id } } }
	rarity { solvers sameRoute players { player { player { id } } count share } }
`

type Play = {
	status: string
	links: number | null
	misses: number
	hints: number
	clues: string[]
	cluesLeft: boolean
	deadEnd: boolean
	seconds: number | null
	resultCode: string | null
	chain: {
		player: {
			player: { id: string }
			teams: { name: string; years: string }[]
		}
		shared: { name: string; label: string; current: boolean }[]
	}[]
	connection: { label: string }[]
	moves: { kind: string; player: { player: { id: string } } | null }[]
	parRoute: { player: { player: { id: string } } }[] | null
	rarity: {
		solvers: number
		sameRoute: number
		players: {
			player: { player: { id: string } }
			count: number
			share: number
		}[]
	} | null
}

type MutationResult = Play & {
	__typename: string
	fieldErrors?: { field: string; message: string }[]
	message?: string
}

const ADD = /* GraphQL */ `
	mutation Add($puzzleId: ID!, $playerId: ID!) {
		addChainPlayer(puzzleId: $puzzleId, playerId: $playerId) {
			__typename
			... on TeammateChainPlay { ${PLAY_FIELDS} }
			... on ValidationError { fieldErrors { field message } }
			... on NotFoundError { message }
		}
	}
`

const UNDO = /* GraphQL */ `
	mutation Undo($puzzleId: ID!) {
		undoChainPlayer(puzzleId: $puzzleId) {
			__typename
			... on TeammateChainPlay { ${PLAY_FIELDS} }
			... on ValidationError { fieldErrors { field message } }
		}
	}
`

const HINT = /* GraphQL */ `
	mutation Hint($puzzleId: ID!) {
		hintTeammateChain(puzzleId: $puzzleId) {
			__typename
			... on TeammateChainPlay { ${PLAY_FIELDS} }
			... on ValidationError { fieldErrors { field message } }
		}
	}
`

const GIVE_UP = /* GraphQL */ `
	mutation GiveUp($puzzleId: ID!) {
		giveUpTeammateChain(puzzleId: $puzzleId) {
			__typename
			... on TeammateChainPlay { ${PLAY_FIELDS} }
		}
	}
`

const START = /* GraphQL */ `
	mutation Start($puzzleId: ID!) {
		startTeammateChain(puzzleId: $puzzleId) {
			__typename
			... on TeammateChainPlay { status seconds }
		}
	}
`

function player(user: User, puzzleId: string) {
	return {
		add: async (playerId: string) =>
			(
				await expectData<{ addChainPlayer: MutationResult }>(ADD, {
					as: user,
					variables: { puzzleId, playerId },
				})
			).addChainPlayer,
		undo: async () =>
			(
				await expectData<{ undoChainPlayer: MutationResult }>(UNDO, {
					as: user,
					variables: { puzzleId },
				})
			).undoChainPlayer,
		hint: async () =>
			(
				await expectData<{ hintTeammateChain: MutationResult }>(HINT, {
					as: user,
					variables: { puzzleId },
				})
			).hintTeammateChain,
		giveUp: async () =>
			(
				await expectData<{ giveUpTeammateChain: MutationResult }>(GIVE_UP, {
					as: user,
					variables: { puzzleId },
				})
			).giveUpTeammateChain,
	}
}

const idsOf = (steps: { player: { player: { id: string } } }[] | null) =>
	steps?.map((step) => step.player.player.id) ?? null

describe("addChainPlayer", () => {
	it("adds teammates, misses anyone else, backs out with undo, and connects", async () => {
		const ctx = await setup()
		const me = player(await makeUser(), ctx.puzzle.id)

		const dead = await me.add(ctx.c.id)
		expect(dead.status).toBe("PLAYING")
		expect(dead.chain[0]?.shared).toEqual([
			{ name: ctx.chi.name, label: "1990-91", current: false },
		])
		expect((await me.undo()).chain).toEqual([])

		const miss = await me.add(ctx.b.id)
		expect(miss.misses).toBe(1)
		expect(miss.chain).toEqual([])
		// Same franchise as the target, a season apart: not teammates.
		expect((await me.add(ctx.target.id)).__typename).toBe("ValidationError")

		await me.add(ctx.a.id)
		const solved = await me.add(ctx.b.id)
		expect(solved.status).toBe("SOLVED")
		expect(solved.links).toBe(3)
		expect(idsOf(solved.chain)).toEqual([ctx.a.id, ctx.b.id])
		expect(solved.connection.map((l) => l.label)).toEqual(["1999-00"])
		expect(solved.moves.map((m) => m.kind)).toEqual([
			"ADD",
			"UNDO",
			"MISS",
			"ADD",
			"ADD",
		])
		expect(solved.resultCode).toMatch(/^3-1-0-\d+$/)
		expect(idsOf(solved.parRoute)).toEqual([ctx.a.id, ctx.b.id])
		expect(solved.rarity).toMatchObject({ solvers: 1, sameRoute: 1 })
		expect(solved.chain[0]?.player.teams).toEqual([
			{ name: ctx.chi.name, years: "1990" },
			{ name: ctx.bos.name, years: "1995" },
		])
	})

	it("refuses a player twice, one from another league, and anything once over", async () => {
		const ctx = await setup()
		const me = player(await makeUser(), ctx.puzzle.id)
		await me.add(ctx.a.id)
		const repeat = await me.add(ctx.a.id)
		expect(repeat.fieldErrors?.[0]?.message).toBe(
			"That player is already in your chain.",
		)
		const outsider = await me.add(ctx.outsider.id)
		expect(outsider.fieldErrors?.[0]?.message).toBe(
			"Pick a player from the list.",
		)
		const gaveUp = await me.giveUp()
		expect(gaveUp.status).toBe("GAVE_UP")
		expect(gaveUp.resultCode).toBe("x-0-0")
		expect(idsOf(gaveUp.parRoute)).toEqual([ctx.a.id, ctx.b.id])
		expect((await me.add(ctx.b.id)).__typename).toBe("ValidationError")
	})

	it("only plays today's puzzle", async () => {
		const ctx = await setup(addArcadeDays(arcadeDay(new Date()), -1))
		const result = await player(await makeUser(), ctx.puzzle.id).add(ctx.a.id)
		expect(result.__typename).toBe("NotFoundError")
	})
})

describe("hintTeammateChain", () => {
	it("gives clues about one mystery teammate, never naming him, and counts them", async () => {
		const ctx = await setup()
		const me = player(await makeUser(), ctx.puzzle.id)
		const first = await me.hint()
		expect(first.hints).toBe(1)
		expect(first.clues).toHaveLength(1)
		// The par route's first player: Alpha Guy, start's teammate on CHI 1990.
		expect(first.clues[0]).toBe(`Look at the 1989-90 ${ctx.chi.name}.`)
		expect(first.moves).toEqual([{ kind: "HINT", player: null }])
		expect(first.deadEnd).toBe(false)

		await me.hint()
		await me.hint()
		const all = await me.hint()
		expect(all.clues).toHaveLength(4)
		expect(all.clues[3]).toBe("Initials: A. G.")
		expect(all.cluesLeft).toBe(false)
		const more = await me.hint()
		expect(more.fieldErrors?.[0]?.message).toBe(
			"That's every clue about this player.",
		)

		// Adding a player starts over with a new mystery.
		const added = await me.add(ctx.a.id)
		expect(added.clues).toEqual([])
		await me.add(ctx.b.id)
		const row = await db.query.teammateChainResults.findFirst({
			where: { puzzleId: ctx.puzzle.id },
		})
		expect(row?.solved).toBe(true)
	})
})

describe("rarity", () => {
	it("compares a route with everyone else's", async () => {
		const ctx = await setup()
		const first = player(await makeUser(), ctx.puzzle.id)
		await first.add(ctx.a.id)
		await first.add(ctx.b.id)
		const second = player(await makeUser(), ctx.puzzle.id)
		await second.add(ctx.c.id)
		const solved = await second.add(ctx.b.id)
		expect(solved.rarity?.solvers).toBe(2)
		expect(solved.rarity?.sameRoute).toBe(1)
		expect(
			solved.rarity?.players.map((p) => [p.player.player.id, p.count, p.share]),
		).toEqual([
			[ctx.c.id, 1, 0.5],
			[ctx.b.id, 2, 1],
		])
	})
})

const TODAY = /* GraphQL */ `
	query Today {
		teammateChainToday {
			id
			par
			start { player { id } }
			target { player { id } }
			viewerPlay { status }
		}
	}
`

describe("teammateChainToday", () => {
	it("shows the pair and par, and the viewer's game only once started", async () => {
		const ctx = await setup()
		const user = await makeUser()
		type Today = {
			teammateChainToday: {
				id: string
				par: number
				start: { player: { id: string } }
				target: { player: { id: string } }
				viewerPlay: { status: string } | null
			}
		}
		const before = await expectData<Today>(TODAY, { as: user })
		expect(before.teammateChainToday).toMatchObject({
			id: ctx.puzzle.id,
			par: 3,
			start: { player: { id: ctx.start.id } },
			target: { player: { id: ctx.target.id } },
			viewerPlay: null,
		})
		const started = await expectData<{
			startTeammateChain: { status: string; seconds: number | null }
		}>(START, { as: user, variables: { puzzleId: ctx.puzzle.id } })
		expect(started.startTeammateChain).toMatchObject({
			status: "PLAYING",
			seconds: null,
		})
		const after = await expectData<Today>(TODAY, { as: user })
		expect(after.teammateChainToday.viewerPlay?.status).toBe("PLAYING")
	})
})

const SEARCH = /* GraphQL */ `
	query Search($puzzleId: ID!, $search: String!) {
		teammateChainPlayers(puzzleId: $puzzleId, search: $search) {
			player { id }
			firstSeason
			lastSeason
		}
	}
`

describe("teammateChainPlayers", () => {
	it("finds the league's players by name, and nobody from another league", async () => {
		const ctx = await setup()
		const search = (term: string) =>
			expectData<{ teammateChainPlayers: { player: { id: string } }[] }>(
				SEARCH,
				{ variables: { puzzleId: ctx.puzzle.id, search: term } },
			)
		const found = await search("bravo")
		expect(found.teammateChainPlayers.map((p) => p.player.id)).toEqual([
			ctx.b.id,
		])
		expect((await search("other")).teammateChainPlayers).toEqual([])
	})
})

const GUEST = /* GraphQL */ `
	query Guest($puzzleId: ID!, $inputs: [TeammateChainInput!]!, $startedAt: DateTime!, $finishedAt: DateTime) {
		teammateChainGuestPlay(puzzleId: $puzzleId, inputs: $inputs, startedAt: $startedAt, finishedAt: $finishedAt) {
			__typename
			... on TeammateChainPlay { ${PLAY_FIELDS} }
		}
	}
`

const IMPORT = /* GraphQL */ `
	mutation Import($puzzleId: ID!, $inputs: [TeammateChainInput!]!, $startedAt: DateTime!, $finishedAt: DateTime) {
		importTeammateChainMoves(puzzleId: $puzzleId, inputs: $inputs, startedAt: $startedAt, finishedAt: $finishedAt) {
			__typename
			... on TeammateChainPlay { ${PLAY_FIELDS} }
		}
	}
`

describe("guest play and import", () => {
	it("judges a guest's inputs without saving, counting their solve in rarity", async () => {
		const ctx = await setup()
		const startedAt = new Date(Date.now() - 90_000).toISOString()
		const data = await expectData<{ teammateChainGuestPlay: Play }>(GUEST, {
			variables: {
				puzzleId: ctx.puzzle.id,
				inputs: [
					{ kind: "PICK", playerId: ctx.b.id },
					{ kind: "PICK", playerId: ctx.a.id },
					{ kind: "PICK", playerId: ctx.b.id },
				],
				startedAt,
				finishedAt: new Date().toISOString(),
			},
		})
		const play = data.teammateChainGuestPlay
		expect(play).toMatchObject({ status: "SOLVED", links: 3, misses: 1 })
		expect(play.seconds).toBeGreaterThanOrEqual(89)
		expect(play.rarity).toMatchObject({ solvers: 1, sameRoute: 1 })
		expect(await db.$count(teammateChainResults)).toBe(0)
	})

	it("imports a guest's game once, keeping an account's own", async () => {
		const ctx = await setup()
		const user = await makeUser()
		const run = (inputs: { kind: string; playerId?: string }[]) =>
			expectData<{ importTeammateChainMoves: Play }>(IMPORT, {
				as: user,
				variables: {
					puzzleId: ctx.puzzle.id,
					inputs,
					startedAt: new Date(Date.now() - 60_000).toISOString(),
					finishedAt: new Date().toISOString(),
				},
			})
		const first = await run([
			{ kind: "PICK", playerId: ctx.a.id },
			{ kind: "PICK", playerId: ctx.b.id },
		])
		expect(first.importTeammateChainMoves.status).toBe("SOLVED")
		const second = await run([{ kind: "GIVE_UP" }])
		expect(second.importTeammateChainMoves.status).toBe("SOLVED")
		const row = await db.query.teammateChainResults.findFirst({
			where: { userId: user.id },
		})
		expect(row?.route).toEqual([ctx.a.id, ctx.b.id])
		expect(row?.solved).toBe(true)
	})
})

const SHARE = /* GraphQL */ `
	query Share($date: String!, $username: String!, $result: String!) {
		teammateChainShare(date: $date) {
			revealed
			sharer(username: $username, result: $result) { id }
			sharerRoute(username: $username, result: $result) {
				steps { player { player { id } } }
			}
			parRoute { steps { player { player { id } } } }
		}
	}
`

describe("TeammateChainShare", () => {
	type Share = {
		teammateChainShare: {
			revealed: boolean
			sharer: { id: string } | null
			sharerRoute: { steps: { player: { player: { id: string } } }[] } | null
			parRoute: { steps: { player: { player: { id: string } } }[] } | null
		} | null
	}

	it("names the sharer only for their real result, and shows routes once the day is over", async () => {
		const day = addArcadeDays(arcadeDay(new Date()), -1)
		const ctx = await setup(day)
		const user = await makeUser()
		const startedAt = new Date(Date.now() - 100_000)
		await db.insert(teammateChainResults).values({
			puzzleId: ctx.puzzle.id,
			userId: user.id,
			moves: [
				{ kind: "add", playerId: ctx.c.id, connects: false },
				{ kind: "add", playerId: ctx.b.id, connects: true },
			],
			startedAt,
			finishedAt: new Date(startedAt.getTime() + 40_000),
			solved: true,
			route: [ctx.c.id, ctx.b.id],
		})
		const ask = (result: string) =>
			expectData<Share>(SHARE, {
				variables: { date: day, username: user.username, result },
			})
		const real = (await ask("3-0-0-40")).teammateChainShare
		expect(real?.revealed).toBe(true)
		expect(real?.sharer?.id).toBe(user.id)
		expect(idsOf(real?.sharerRoute?.steps ?? null)).toEqual([
			ctx.c.id,
			ctx.b.id,
		])
		expect(idsOf(real?.parRoute?.steps ?? null)).toEqual([ctx.a.id, ctx.b.id])
		const fake = (await ask("2-0-0-5")).teammateChainShare
		expect(fake?.sharer).toBeNull()
		expect(fake?.sharerRoute).toBeNull()
	})

	it("hides routes on the day itself", async () => {
		await setup()
		const data = await expectData<Share>(SHARE, {
			variables: {
				date: arcadeDay(new Date()),
				username: "nobody",
				result: "x-0-0",
			},
		})
		expect(data.teammateChainShare).toMatchObject({
			revealed: false,
			parRoute: null,
		})
	})
})

const BOARD = /* GraphQL */ `
	query Board($groupId: ID!) {
		group(id: $groupId) {
			teammateChainBoard {
				par
				today { user { id } status links hints misses }
			}
			arcadeWeek { user { id } points played }
		}
	}
`

type BoardResult = {
	group: {
		teammateChainBoard: {
			par: number | null
			today: {
				user: { id: string }
				status: string
				links: number | null
				misses: number
			}[]
		} | null
		arcadeWeek:
			| { user: { id: string }; points: number; played: number }[]
			| null
	} | null
}

describe("Group.teammateChainBoard", () => {
	it("ranks members by links then misses, and scores the week", async () => {
		const ctx = await setup()
		const admin = await makeUser()
		const member = await makeUser()
		const idle = await makeUser()
		const group = await makeGroup({ admin, members: [member, idle] })

		const mine = player(admin, ctx.puzzle.id)
		await mine.add(ctx.b.id)
		await mine.add(ctx.a.id)
		await mine.add(ctx.b.id)
		const theirs = player(member, ctx.puzzle.id)
		await theirs.add(ctx.a.id)
		await theirs.add(ctx.b.id)

		const data = await expectData<BoardResult>(BOARD, {
			as: admin,
			variables: { groupId: group.id },
		})
		const board = data.group?.teammateChainBoard
		expect(board?.par).toBe(3)
		expect(
			board?.today.map((r) => [r.user.id, r.status, r.links, r.misses]),
		).toEqual([
			[member.id, "SOLVED", 3, 0],
			[admin.id, "SOLVED", 3, 1],
			[idle.id, "NOT_PLAYED", null, 0],
		])
		const week = new Map(
			data.group?.arcadeWeek?.map((row) => [row.user.id, row]) ?? [],
		)
		expect(week.get(admin.id)).toMatchObject({ points: 6, played: 1 })
		expect(week.get(member.id)).toMatchObject({ points: 6, played: 1 })
		expect(week.get(idle.id)).toMatchObject({ points: 0, played: 0 })
	})

	it("isn't shown to someone outside the group", async () => {
		const admin = await makeUser()
		const group = await makeGroup({ admin })
		const result = await execute(BOARD, {
			as: await makeUser(),
			variables: { groupId: group.id },
		})
		const data = result.data as BoardResult | null
		expect(data?.group?.teammateChainBoard ?? null).toBeNull()
	})
})
