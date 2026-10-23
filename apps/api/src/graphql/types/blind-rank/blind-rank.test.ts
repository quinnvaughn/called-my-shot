import { describe, expect, it } from "vitest"
import { db } from "../../../db"
import { rankPuzzles, teamSeasons } from "../../../db/schema"
import { addArcadeDays, arcadeDay } from "../../../lib/arcade/day"
import {
	makeAdmin,
	makeGroup,
	makeLeague,
	makeTeam,
	makeUser,
} from "../../../test/factories"
import { execute, expectData } from "../../../test/graphql"

// Blind Rank: five things placed one at a time, played signed in or out,
// shared by squares, and compared inside groups.

// Reveal order: values 30, 10, 50, 20, 40, so the true slots (1 the most)
// are 3, 5, 1, 4, 2.
const ITEMS = [30, 10, 50, 20, 40].map((value) => ({
	label: `Player ${value}`,
	sublabel: null,
	teamId: null,
	value,
	display: String(value),
}))
const PERFECT = [3, 5, 1, 4, 2]

async function setup(day = arcadeDay(new Date())) {
	const league = await makeLeague()
	const [puzzle] = await db
		.insert(rankPuzzles)
		.values({
			leagueId: league.id,
			kind: "season_stat",
			prompt: "Points",
			context: "2007 NBA season",
			items: ITEMS,
			signature: `test:${day}:${Math.random()}`,
			playDate: day,
		})
		.returning()
	if (!puzzle) throw new Error("no puzzle")
	return { league, puzzle }
}

const PLAY_FIELDS = `
	status
	correctCount
	next { label }
	slots { slot correct placed { label } answer { display item { label } } }
`

const PLACE = /* GraphQL */ `
	mutation Place($puzzleId: ID!, $slot: Int!) {
		placeRank(puzzleId: $puzzleId, slot: $slot) {
			__typename
			... on RankPlay { ${PLAY_FIELDS} }
			... on ValidationError { fieldErrors { field message } }
			... on NotFoundError { message }
		}
	}
`

type Play = {
	status: string
	correctCount: number | null
	next: { label: string } | null
	slots: {
		slot: number
		correct: boolean | null
		placed: { label: string } | null
		answer: { display: string; item: { label: string } } | null
	}[]
}
type PlaceResult = { placeRank: Play & { __typename: string } }

async function placeAll(
	as: Awaited<ReturnType<typeof makeUser>>,
	puzzleId: string,
	slots: number[],
) {
	let last: PlaceResult | null = null
	for (const slot of slots) {
		last = await expectData<PlaceResult>(PLACE, {
			as,
			variables: { puzzleId, slot },
		})
	}
	return last
}

describe("placeRank", () => {
	it("shows one item at a time, holds back values, and scores once all five are in", async () => {
		const ctx = await setup()
		const user = await makeUser()

		const first = await expectData<PlaceResult>(PLACE, {
			as: user,
			variables: { puzzleId: ctx.puzzle.id, slot: 3 },
		})
		expect(first.placeRank.status).toBe("PLAYING")
		expect(first.placeRank.next?.label).toBe("Player 10")
		expect(first.placeRank.slots.every((s) => s.answer === null)).toBe(true)

		const taken = await expectData<PlaceResult>(PLACE, {
			as: user,
			variables: { puzzleId: ctx.puzzle.id, slot: 3 },
		})
		expect(taken.placeRank.__typename).toBe("ValidationError")

		// Slots 4 and 2 swapped from perfect: three right.
		const done = await placeAll(user, ctx.puzzle.id, [5, 1, 2, 4])
		expect(done?.placeRank.status).toBe("DONE")
		expect(done?.placeRank.correctCount).toBe(3)
		expect(done?.placeRank.slots[0]?.answer?.item.label).toBe("Player 50")
		// Players 20 and 40 swapped, in slots 2 and 4.
		expect(done?.placeRank.slots.map((s) => s.correct)).toEqual([
			true,
			false,
			true,
			false,
			true,
		])
	})

	it("only plays today's puzzle", async () => {
		const ctx = await setup(addArcadeDays(arcadeDay(new Date()), -1))
		const data = await expectData<PlaceResult>(PLACE, {
			as: await makeUser(),
			variables: { puzzleId: ctx.puzzle.id, slot: 1 },
		})
		expect(data.placeRank.__typename).toBe("NotFoundError")
	})
})

describe("rankPuzzleToday", () => {
	it("fills an empty day from the pools on the first visit", async () => {
		const league = await makeLeague({ slug: "nfl" })
		for (const [i, wins] of [16, 13, 11, 9, 7, 4].entries()) {
			const team = await makeTeam({ leagueId: league.id })
			await db.insert(teamSeasons).values({
				leagueId: league.id,
				teamId: team.id,
				year: 2007,
				label: "2007",
				name: `Team ${i}`,
				wins,
				losses: 16 - wins,
				pointsFor: 300 + i * 40,
				pointsAgainst: 250 + i * 40,
				outcome: i === 0 ? "champion" : "missed",
				leaders: [],
			})
		}
		const data = await expectData<{
			rankPuzzleToday: { date: string; prompt: string } | null
		}>(/* GraphQL */ `
			query Today {
				rankPuzzleToday { date prompt }
			}
		`)
		expect(data.rankPuzzleToday?.date).toBe(arcadeDay(new Date()))
	})
})

const GUEST = /* GraphQL */ `
	query Guest($puzzleId: ID!, $placements: [Int!]!) {
		rankPuzzleGuestPlay(puzzleId: $puzzleId, placements: $placements) {
			__typename
			... on RankPlay { ${PLAY_FIELDS} }
		}
	}
`

describe("rankPuzzleGuestPlay", () => {
	it("evaluates without storing, dropping placements that couldn't be made", async () => {
		const ctx = await setup()
		// Slots are 0-based here, as the browser holds them.
		const data = await expectData<{ rankPuzzleGuestPlay: Play }>(GUEST, {
			variables: { puzzleId: ctx.puzzle.id, placements: [2, 2, 9, 4] },
		})
		expect(data.rankPuzzleGuestPlay.next?.label).toBe("Player 50")
		expect(data.rankPuzzleGuestPlay.slots.filter((s) => s.placed).length).toBe(
			2,
		)
		const rows = await db.query.rankPuzzleResults.findMany({
			where: { puzzleId: ctx.puzzle.id },
		})
		expect(rows).toHaveLength(0)
	})
})

describe("admin practice", () => {
	it("plays any day's puzzle unsaved for an admin, and no one else", async () => {
		const ctx = await setup(addArcadeDays(arcadeDay(new Date()), 3))
		const admin = await makeAdmin()
		type Guest = { rankPuzzleGuestPlay: Play & { __typename: string } }
		const variables = { puzzleId: ctx.puzzle.id, placements: [2] }
		const refused = await expectData<Guest>(GUEST, {
			as: await makeUser(),
			variables,
		})
		expect(refused.rankPuzzleGuestPlay.__typename).toBe("NotFoundError")
		const practice = await expectData<Guest>(GUEST, { as: admin, variables })
		expect(practice.rankPuzzleGuestPlay.next?.label).toBe("Player 10")

		const PUZZLE = /* GraphQL */ `
			query Puzzle($date: String!) {
				adminRankPuzzle(date: $date) {
					__typename
					... on RankPuzzle { id }
				}
			}
		`
		type Puzzle = { adminRankPuzzle: { __typename: string; id?: string } }
		const date = { date: ctx.puzzle.playDate }
		const denied = await expectData<Puzzle>(PUZZLE, {
			as: await makeUser(),
			variables: date,
		})
		expect(denied.adminRankPuzzle.__typename).toBe("AuthorizationError")
		const found = await expectData<Puzzle>(PUZZLE, {
			as: admin,
			variables: date,
		})
		expect(found.adminRankPuzzle.id).toBe(ctx.puzzle.id)
	})

	it("resets only the admin's own game on today's puzzle", async () => {
		const ctx = await setup()
		const admin = await makeAdmin()
		const player = await makeUser()
		await placeAll(admin, ctx.puzzle.id, PERFECT)
		await placeAll(player, ctx.puzzle.id, PERFECT)
		const RESET = /* GraphQL */ `
			mutation Reset {
				resetMyRankPlay {
					__typename
					... on RankPuzzle { viewerPlay { status } }
				}
			}
		`
		type Reset = {
			resetMyRankPlay: {
				__typename: string
				viewerPlay?: { status: string } | null
			}
		}
		const denied = await expectData<Reset>(RESET, { as: player })
		expect(denied.resetMyRankPlay.__typename).toBe("AuthorizationError")
		const reset = await expectData<Reset>(RESET, { as: admin })
		expect(reset.resetMyRankPlay.viewerPlay?.status).toBe("PLAYING")
		const rows = await db.query.rankPuzzleResults.findMany({
			where: { puzzleId: ctx.puzzle.id },
		})
		expect(rows.map((r) => r.userId)).toEqual([player.id])
	})
})

describe("importRankPlacements", () => {
	it("saves a guest's game once, and never over one the account has", async () => {
		const ctx = await setup()
		const user = await makeUser()
		const IMPORT = /* GraphQL */ `
			mutation Import($puzzleId: ID!, $placements: [Int!]!) {
				importRankPlacements(puzzleId: $puzzleId, placements: $placements) {
					__typename
					... on RankPlay { correctCount }
				}
			}
		`
		type Result = { importRankPlacements: { correctCount: number | null } }
		const zeroBased = PERFECT.map((s) => s - 1)
		const first = await expectData<Result>(IMPORT, {
			as: user,
			variables: { puzzleId: ctx.puzzle.id, placements: zeroBased },
		})
		expect(first.importRankPlacements.correctCount).toBe(5)
		const again = await expectData<Result>(IMPORT, {
			as: user,
			variables: { puzzleId: ctx.puzzle.id, placements: [0, 1, 2, 3, 4] },
		})
		expect(again.importRankPlacements.correctCount).toBe(5)
	})
})

describe("rankPuzzleShare", () => {
	it("hides the order on the day, and names a sharer only for their real squares", async () => {
		const ctx = await setup()
		const user = await makeUser()
		await placeAll(user, ctx.puzzle.id, PERFECT)
		const SHARE = /* GraphQL */ `
			query Share($date: String!, $username: String!, $result: String!) {
				rankPuzzleShare(date: $date) {
					answer { display }
					sharer(username: $username, result: $result) { id }
				}
			}
		`
		type Share = {
			rankPuzzleShare: {
				answer: { display: string }[] | null
				sharer: { id: string } | null
			}
		}
		const ask = (result: string) =>
			expectData<Share>(SHARE, {
				variables: {
					date: ctx.puzzle.playDate,
					username: user.username,
					result,
				},
			})
		const real = await ask("ggggg")
		expect(real.rankPuzzleShare.answer).toBeNull()
		expect(real.rankPuzzleShare.sharer?.id).toBe(user.id)
		expect((await ask("rrggg")).rankPuzzleShare.sharer).toBeNull()
	})
})

describe("admin overrides", () => {
	const EDIT = /* GraphQL */ `
		mutation Edit($date: String!, $prompt: String!, $context: String!) {
			editRankPrompt(date: $date, prompt: $prompt, context: $context) {
				__typename
				... on RankPuzzleAdmin { prompt order { display } }
			}
		}
	`
	type Edit = {
		editRankPrompt: {
			__typename: string
			prompt?: string
			order?: { display: string }[]
		}
	}

	it("is admin-only, and rewords a day showing the true order", async () => {
		const ctx = await setup()
		const vars = {
			date: ctx.puzzle.playDate,
			prompt: "Points scored",
			context: "2007 NBA season",
		}
		const denied = await expectData<Edit>(EDIT, {
			as: await makeUser(),
			variables: vars,
		})
		expect(denied.editRankPrompt.__typename).toBe("AuthorizationError")
		const edited = await expectData<Edit>(EDIT, {
			as: await makeAdmin(),
			variables: vars,
		})
		expect(edited.editRankPrompt.prompt).toBe("Points scored")
		expect(edited.editRankPrompt.order?.map((o) => o.display)).toEqual([
			"50",
			"40",
			"30",
			"20",
			"10",
		])
	})

	it("swaps two future days", async () => {
		const today = arcadeDay(new Date())
		const a = await setup(addArcadeDays(today, 3))
		const b = await setup(addArcadeDays(today, 4))
		await expectData(
			/* GraphQL */ `
				mutation Swap($date: String!, $otherDate: String!) {
					swapRankPuzzles(date: $date, otherDate: $otherDate) { __typename }
				}
			`,
			{
				as: await makeAdmin(),
				variables: { date: a.puzzle.playDate, otherDate: b.puzzle.playDate },
			},
		)
		const moved = await db.query.rankPuzzles.findFirst({
			where: { id: a.puzzle.id },
		})
		expect(moved?.playDate).toBe(b.puzzle.playDate)
	})
})

describe("group boards", () => {
	const BOARD = /* GraphQL */ `
		query Board($groupId: ID!) {
			group(id: $groupId) {
				rankBoard { today { user { id } status squares correctCount } }
				arcadeWeek { user { id } points played }
			}
		}
	`
	type Board = {
		group: {
			rankBoard: {
				today: {
					user: { id: string }
					status: string
					squares: boolean[]
					correctCount: number | null
				}[]
			} | null
			arcadeWeek:
				| { user: { id: string }; points: number; played: number }[]
				| null
		} | null
	}

	it("ranks members by today's result and adds it to the week", async () => {
		const ctx = await setup()
		const admin = await makeUser()
		const member = await makeUser()
		const group = await makeGroup({ admin, members: [member] })
		await placeAll(admin, ctx.puzzle.id, PERFECT)
		await placeAll(member, ctx.puzzle.id, [3, 5, 2, 4, 1])

		const data = await expectData<Board>(BOARD, {
			as: admin,
			variables: { groupId: group.id },
		})
		expect(
			data.group?.rankBoard?.today.map((r) => [r.user.id, r.correctCount]),
		).toEqual([
			[admin.id, 5],
			[member.id, 3],
		])
		expect(data.group?.arcadeWeek?.[0]).toEqual({
			user: { id: admin.id },
			points: 5,
			played: 1,
		})
	})

	it("isn't shown to someone outside the group", async () => {
		const admin = await makeUser()
		const group = await makeGroup({ admin })
		const result = await execute(BOARD, {
			as: await makeUser(),
			variables: { groupId: group.id },
		})
		const data = result.data as Board | null
		expect(data?.group?.rankBoard ?? null).toBeNull()
	})
})
