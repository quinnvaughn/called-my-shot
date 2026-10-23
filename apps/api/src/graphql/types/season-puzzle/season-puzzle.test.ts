import { describe, expect, it } from "vitest"
import { db } from "../../../db"
import { seasonPuzzles, type TeamSeason, teamSeasons } from "../../../db/schema"
import { addArcadeDays, arcadeDay } from "../../../lib/arcade/day"
import {
	makeAdmin,
	makeGroup,
	makeLeague,
	makeTeam,
	makeUser,
} from "../../../test/factories"
import { execute, expectData } from "../../../test/graphql"

// Name That Season: a team's season a day, played signed in or out, picked
// from the archive, and compared inside groups.

const CLUES = [
	"Clue one, the vaguest",
	"Clue two, a bit more",
	"Clue three, warmer now",
	"Clue four, getting there",
	"Clue five, nearly there",
	"Clue six, a giveaway",
]

const LEADERS = [
	{
		category: "passingLeader",
		athlete: "Q. Back",
		line: "300/500, 4000 YDS, 30 TD, 10 INT",
	},
	{
		category: "rushingLeader",
		athlete: "R. Back",
		line: "250 CAR, 1100 YDS, 9 TD",
	},
	{
		category: "receivingLeader",
		athlete: "W. Out",
		line: "90 REC, 1200 YDS, 10 TD",
	},
]

async function archive(
	leagueId: string,
	teamId: string,
	year: number,
): Promise<TeamSeason> {
	const [row] = await db
		.insert(teamSeasons)
		.values({
			leagueId,
			teamId,
			year,
			label: String(year),
			name: `Old name ${year}`,
			wins: 10,
			losses: 6,
			pointsFor: 400,
			pointsAgainst: 300,
			division: "AFC East",
			divisionRank: 1,
			outcome: "missed",
			leaders: LEADERS,
		})
		.returning()
	if (!row) throw new Error("no team season")
	return row
}

async function setup(day = arcadeDay(new Date())) {
	const league = await makeLeague()
	const answerTeam = await makeTeam({ leagueId: league.id })
	const wrongTeam = await makeTeam({ leagueId: league.id })
	const answer = await archive(league.id, answerTeam.id, 2007)
	await archive(league.id, answerTeam.id, 2003)
	await archive(league.id, answerTeam.id, 2011)
	await archive(league.id, wrongTeam.id, 2007)
	await archive(league.id, wrongTeam.id, 2008)
	const [puzzle] = await db
		.insert(seasonPuzzles)
		.values({ teamSeasonId: answer.id, clues: CLUES, playDate: day })
		.returning()
	if (!puzzle) throw new Error("no puzzle")
	return { league, answerTeam, wrongTeam, answer, puzzle }
}

const PLAY_FIELDS = `
	status
	clues
	guessCount
	answer { id label }
	guesses { team { id } year outcome direction }
`

const GUESS = /* GraphQL */ `
	mutation Guess($puzzleId: ID!, $teamId: ID!, $year: Int!) {
		guessSeason(puzzleId: $puzzleId, teamId: $teamId, year: $year) {
			__typename
			... on SeasonPuzzlePlay { ${PLAY_FIELDS} }
			... on ValidationError { fieldErrors { field message } }
			... on NotFoundError { message }
		}
	}
`

type Play = {
	status: string
	clues: string[]
	guessCount: number | null
	answer: { id: string; label: string } | null
	guesses: {
		team: { id: string }
		year: number
		outcome: string
		direction: string | null
	}[]
}
type GuessResult = {
	guessSeason: Play & {
		__typename: string
		fieldErrors?: { field: string; message: string }[]
	}
}

describe("guessSeason", () => {
	it("reveals a clue per wrong guess, points a close guess at the answer, and ends on it", async () => {
		const ctx = await setup()
		const user = await makeUser()
		const guess = (teamId: string, year: number) =>
			expectData<GuessResult>(GUESS, {
				as: user,
				variables: { puzzleId: ctx.puzzle.id, teamId, year },
			})

		const miss = await guess(ctx.wrongTeam.id, 2007)
		expect(miss.guessSeason.status).toBe("PLAYING")
		expect(miss.guessSeason.clues).toEqual(CLUES.slice(0, 2))
		expect(miss.guessSeason.answer).toBeNull()

		const repeat = await guess(ctx.wrongTeam.id, 2007)
		expect(repeat.guessSeason.__typename).toBe("ValidationError")

		const unknown = await guess(ctx.answerTeam.id, 1950)
		expect(unknown.guessSeason.__typename).toBe("ValidationError")

		const close = await guess(ctx.answerTeam.id, 2011)
		expect(
			close.guessSeason.guesses.map((g) => [g.outcome, g.direction]),
		).toEqual([
			["MISS", null],
			["CLOSE", "EARLIER"],
		])

		const solved = await guess(ctx.answerTeam.id, 2007)
		expect(solved.guessSeason.status).toBe("SOLVED")
		expect(solved.guessSeason.guessCount).toBe(3)
		expect(solved.guessSeason.answer?.id).toBe(ctx.answer.id)
		expect(solved.guessSeason.clues).toHaveLength(6)
	})

	it("only plays today's puzzle", async () => {
		const ctx = await setup(addArcadeDays(arcadeDay(new Date()), -1))
		const data = await expectData<GuessResult>(GUESS, {
			as: await makeUser(),
			variables: {
				puzzleId: ctx.puzzle.id,
				teamId: ctx.answerTeam.id,
				year: 2007,
			},
		})
		expect(data.guessSeason.__typename).toBe("NotFoundError")
	})
})

const TODAY = /* GraphQL */ `
	query Today {
		seasonPuzzleToday { id date league { id } }
	}
`

describe("seasonPuzzleToday", () => {
	it("fills an empty day from the archive on the first visit", async () => {
		const league = await makeLeague({ slug: "nfl" })
		const team = await makeTeam({ leagueId: league.id })
		const season = await archive(league.id, team.id, 1999)
		const data = await expectData<{
			seasonPuzzleToday: { date: string; league: { id: string } } | null
		}>(TODAY)
		expect(data.seasonPuzzleToday?.date).toBe(arcadeDay(new Date()))
		expect(data.seasonPuzzleToday?.league.id).toBe(league.id)
		const puzzle = await db.query.seasonPuzzles.findFirst({
			where: { teamSeasonId: season.id },
		})
		expect(puzzle?.clues).toHaveLength(6)
	})

	it("stays empty when the archive has nothing", async () => {
		const data = await expectData<{ seasonPuzzleToday: unknown }>(TODAY)
		expect(data.seasonPuzzleToday).toBeNull()
	})
})

const OPTIONS = /* GraphQL */ `
	query Options($leagueId: ID!) {
		seasonGuessOptions(leagueId: $leagueId) {
			team { id }
			seasons { year label }
			formerNames
		}
	}
`

describe("seasonGuessOptions", () => {
	it("lists each franchise's archived seasons and former names", async () => {
		const ctx = await setup()
		const data = await expectData<{
			seasonGuessOptions: {
				team: { id: string }
				seasons: { year: number }[]
				formerNames: string[]
			}[]
		}>(OPTIONS, { variables: { leagueId: ctx.league.id } })
		const answer = data.seasonGuessOptions.find(
			(f) => f.team.id === ctx.answerTeam.id,
		)
		expect(answer?.seasons.map((s) => s.year)).toEqual([2003, 2007, 2011])
		expect(answer?.formerNames).toContain("Old name 2003")
	})
})

const GUEST = /* GraphQL */ `
	query Guest($puzzleId: ID!, $guesses: [SeasonPuzzleGuessInput!]!) {
		seasonPuzzleGuestPlay(puzzleId: $puzzleId, guesses: $guesses) {
			__typename
			... on SeasonPuzzlePlay { ${PLAY_FIELDS} }
		}
	}
`

describe("seasonPuzzleGuestPlay", () => {
	it("evaluates without storing, dropping guesses that couldn't be made", async () => {
		const ctx = await setup()
		const data = await expectData<{ seasonPuzzleGuestPlay: Play }>(GUEST, {
			variables: {
				puzzleId: ctx.puzzle.id,
				guesses: [
					{ teamId: ctx.wrongTeam.id, year: 2008 },
					{ teamId: ctx.wrongTeam.id, year: 1900 },
					{ teamId: ctx.wrongTeam.id, year: 2008 },
					{ teamId: ctx.answerTeam.id, year: 2003 },
				],
			},
		})
		expect(
			data.seasonPuzzleGuestPlay.guesses.map((g) => [g.outcome, g.direction]),
		).toEqual([
			["MISS", "EARLIER"],
			["CLOSE", "LATER"],
		])
		expect(data.seasonPuzzleGuestPlay.clues).toEqual(CLUES.slice(0, 3))
		const rows = await db.query.seasonPuzzleResults.findMany({
			where: { puzzleId: ctx.puzzle.id },
		})
		expect(rows).toHaveLength(0)
	})
})

describe("admin practice", () => {
	it("plays any day's puzzle unsaved for an admin, and no one else", async () => {
		const ctx = await setup(addArcadeDays(arcadeDay(new Date()), 3))
		const admin = await makeAdmin()
		type Guest = { seasonPuzzleGuestPlay: Play & { __typename: string } }
		const variables = {
			puzzleId: ctx.puzzle.id,
			guesses: [{ teamId: ctx.wrongTeam.id, year: 2008 }],
		}
		const refused = await expectData<Guest>(GUEST, {
			as: await makeUser(),
			variables,
		})
		expect(refused.seasonPuzzleGuestPlay.__typename).toBe("NotFoundError")
		const practice = await expectData<Guest>(GUEST, { as: admin, variables })
		expect(practice.seasonPuzzleGuestPlay.clues).toEqual(CLUES.slice(0, 2))

		const PUZZLE = /* GraphQL */ `
			query Puzzle($date: String!) {
				adminSeasonPuzzle(date: $date) {
					__typename
					... on SeasonPuzzle { id }
				}
			}
		`
		type Puzzle = { adminSeasonPuzzle: { __typename: string; id?: string } }
		const date = { date: ctx.puzzle.playDate }
		const denied = await expectData<Puzzle>(PUZZLE, {
			as: await makeUser(),
			variables: date,
		})
		expect(denied.adminSeasonPuzzle.__typename).toBe("AuthorizationError")
		const found = await expectData<Puzzle>(PUZZLE, {
			as: admin,
			variables: date,
		})
		expect(found.adminSeasonPuzzle.id).toBe(ctx.puzzle.id)
	})

	it("resets only the admin's own game on today's puzzle", async () => {
		const ctx = await setup()
		const admin = await makeAdmin()
		const player = await makeUser()
		for (const as of [admin, player]) {
			await expectData<GuessResult>(GUESS, {
				as,
				variables: {
					puzzleId: ctx.puzzle.id,
					teamId: ctx.answerTeam.id,
					year: 2007,
				},
			})
		}
		const RESET = /* GraphQL */ `
			mutation Reset {
				resetMySeasonPlay {
					__typename
					... on SeasonPuzzle { viewerPlay { status } }
				}
			}
		`
		type Reset = {
			resetMySeasonPlay: {
				__typename: string
				viewerPlay?: { status: string } | null
			}
		}
		const denied = await expectData<Reset>(RESET, { as: player })
		expect(denied.resetMySeasonPlay.__typename).toBe("AuthorizationError")
		const reset = await expectData<Reset>(RESET, { as: admin })
		expect(reset.resetMySeasonPlay.viewerPlay?.status).toBe("PLAYING")
		const rows = await db.query.seasonPuzzleResults.findMany({
			where: { puzzleId: ctx.puzzle.id },
		})
		expect(rows.map((r) => r.userId)).toEqual([player.id])
	})
})

const IMPORT = /* GraphQL */ `
	mutation Import($puzzleId: ID!, $guesses: [SeasonPuzzleGuessInput!]!) {
		importSeasonGuesses(puzzleId: $puzzleId, guesses: $guesses) {
			__typename
			... on SeasonPuzzlePlay { ${PLAY_FIELDS} }
		}
	}
`

describe("importSeasonGuesses", () => {
	it("saves a guest's game once, and never over a game the account has", async () => {
		const ctx = await setup()
		const user = await makeUser()
		const first = await expectData<{ importSeasonGuesses: Play }>(IMPORT, {
			as: user,
			variables: {
				puzzleId: ctx.puzzle.id,
				guesses: [
					{ teamId: ctx.wrongTeam.id, year: 2007 },
					{ teamId: ctx.answerTeam.id, year: 2007 },
				],
			},
		})
		expect(first.importSeasonGuesses.guessCount).toBe(2)

		const again = await expectData<{ importSeasonGuesses: Play }>(IMPORT, {
			as: user,
			variables: {
				puzzleId: ctx.puzzle.id,
				guesses: [{ teamId: ctx.answerTeam.id, year: 2007 }],
			},
		})
		expect(again.importSeasonGuesses.guessCount).toBe(2)
	})
})

const SHARE = /* GraphQL */ `
	query Share($date: String!) {
		seasonPuzzleShare(date: $date) { date answer { id } }
	}
`

describe("seasonPuzzleShare", () => {
	it("hides the answer on the day and shows it after", async () => {
		const today = arcadeDay(new Date())
		await setup(today)
		const past = await setup(addArcadeDays(today, -3))
		const future = addArcadeDays(today, 3)
		await setup(future)

		type Share = {
			seasonPuzzleShare: { answer: { id: string } | null } | null
		}
		const onTheDay = await expectData<Share>(SHARE, {
			variables: { date: today },
		})
		expect(onTheDay.seasonPuzzleShare?.answer).toBeNull()

		const after = await expectData<Share>(SHARE, {
			variables: { date: past.puzzle.playDate },
		})
		expect(after.seasonPuzzleShare?.answer?.id).toBe(past.answer.id)

		const ahead = await expectData<Share>(SHARE, {
			variables: { date: future },
		})
		expect(ahead.seasonPuzzleShare).toBeNull()
	})
})

const SHARER = /* GraphQL */ `
	query Sharer($date: String!, $username: String!, $result: String!) {
		seasonPuzzleShare(date: $date) {
			sharer(username: $username, result: $result) { id }
		}
	}
`

describe("SeasonPuzzleShare.sharer", () => {
	it("names the sharer only when the link's squares are their real result", async () => {
		const ctx = await setup()
		const user = await makeUser()
		for (const year of [2011, 2007]) {
			await expectData(GUESS, {
				as: user,
				variables: {
					puzzleId: ctx.puzzle.id,
					teamId: ctx.answerTeam.id,
					year,
				},
			})
		}
		type Result = { seasonPuzzleShare: { sharer: { id: string } | null } }
		const ask = (result: string) =>
			expectData<Result>(SHARER, {
				variables: {
					date: ctx.puzzle.playDate,
					username: user.username,
					result,
				},
			})
		expect((await ask("yg")).seasonPuzzleShare.sharer?.id).toBe(user.id)
		expect((await ask("g")).seasonPuzzleShare.sharer).toBeNull()
	})
})

const SET = /* GraphQL */ `
	mutation Set($date: String!, $teamId: ID!, $year: Int!) {
		setSeasonPuzzle(date: $date, teamId: $teamId, year: $year) {
			__typename
			... on SeasonPuzzleAdmin { date clues answer { year } }
			... on ValidationError { fieldErrors { field message } }
		}
	}
`

const SWAP = /* GraphQL */ `
	mutation Swap($date: String!, $otherDate: String!) {
		swapSeasonPuzzles(date: $date, otherDate: $otherDate) {
			__typename
			... on SeasonPuzzleAdmin { date answer { year } }
		}
	}
`

const EDIT = /* GraphQL */ `
	mutation Edit($date: String!, $clues: [String!]!) {
		editSeasonPuzzleClues(date: $date, clues: $clues) {
			__typename
			... on SeasonPuzzleAdmin { clues }
			... on ValidationError { fieldErrors { field message } }
		}
	}
`

describe("admin overrides", () => {
	type SetResult = {
		setSeasonPuzzle: {
			__typename: string
			clues?: string[]
			answer?: { year: number }
		}
	}

	async function archivedTeam() {
		const league = await makeLeague({ slug: "nfl" })
		const team = await makeTeam({ leagueId: league.id })
		await archive(league.id, team.id, 1999)
		await archive(league.id, team.id, 2000)
		return team
	}

	it("is admin-only", async () => {
		const team = await archivedTeam()
		const data = await expectData<SetResult>(SET, {
			as: await makeUser(),
			variables: {
				date: addArcadeDays(arcadeDay(new Date()), 5),
				teamId: team.id,
				year: 1999,
			},
		})
		expect(data.setSeasonPuzzle.__typename).toBe("AuthorizationError")
	})

	it("puts a chosen season on a day with fresh clues, and swaps two days", async () => {
		const admin = await makeAdmin()
		const team = await archivedTeam()
		const today = arcadeDay(new Date())
		const dayA = addArcadeDays(today, 5)
		const dayB = addArcadeDays(today, 6)
		const a = await expectData<SetResult>(SET, {
			as: admin,
			variables: { date: dayA, teamId: team.id, year: 1999 },
		})
		expect(a.setSeasonPuzzle.clues).toHaveLength(6)
		await expectData(SET, {
			as: admin,
			variables: { date: dayB, teamId: team.id, year: 2000 },
		})

		const swapped = await expectData<{
			swapSeasonPuzzles: { date: string; answer: { year: number } }
		}>(SWAP, { as: admin, variables: { date: dayA, otherDate: dayB } })
		expect(swapped.swapSeasonPuzzles.answer.year).toBe(2000)
		const other = await db.query.seasonPuzzles.findFirst({
			where: { playDate: dayB },
			with: { teamSeason: true },
		})
		expect(other?.teamSeason.year).toBe(1999)
	})

	it("won't change today, or schedule a season twice", async () => {
		const admin = await makeAdmin()
		const team = await archivedTeam()
		const today = arcadeDay(new Date())
		const onToday = await expectData<SetResult>(SET, {
			as: admin,
			variables: { date: today, teamId: team.id, year: 1999 },
		})
		expect(onToday.setSeasonPuzzle.__typename).toBe("ValidationError")

		await expectData(SET, {
			as: admin,
			variables: {
				date: addArcadeDays(today, 2),
				teamId: team.id,
				year: 1999,
			},
		})
		const twice = await expectData<SetResult>(SET, {
			as: admin,
			variables: {
				date: addArcadeDays(today, 3),
				teamId: team.id,
				year: 1999,
			},
		})
		expect(twice.setSeasonPuzzle.__typename).toBe("ValidationError")
	})

	it("rewrites today's clues, six of them", async () => {
		const admin = await makeAdmin()
		const ctx = await setup()
		const edited = [...CLUES.slice(0, 5), "A better last clue"]
		const data = await expectData<{
			editSeasonPuzzleClues: { __typename: string; clues?: string[] }
		}>(EDIT, {
			as: admin,
			variables: { date: ctx.puzzle.playDate, clues: edited },
		})
		expect(data.editSeasonPuzzleClues.clues).toEqual(edited)

		const short = await expectData<{
			editSeasonPuzzleClues: { __typename: string }
		}>(EDIT, {
			as: admin,
			variables: { date: ctx.puzzle.playDate, clues: CLUES.slice(0, 5) },
		})
		expect(short.editSeasonPuzzleClues.__typename).toBe("ValidationError")
	})
})

const BOARD = /* GraphQL */ `
	query Board($groupId: ID!) {
		group(id: $groupId) {
			seasonPuzzleBoard {
				today { user { id } status squares }
			}
			arcadeWeek { user { id } points played }
		}
	}
`

type BoardResult = {
	group: {
		seasonPuzzleBoard: {
			today: { user: { id: string }; status: string; squares: string[] }[]
		} | null
		arcadeWeek:
			| { user: { id: string }; points: number; played: number }[]
			| null
	} | null
}

describe("Group.seasonPuzzleBoard", () => {
	it("ranks members by today's result and scores the week", async () => {
		const ctx = await setup()
		const admin = await makeUser()
		const member = await makeUser()
		const idle = await makeUser()
		const group = await makeGroup({ admin, members: [member, idle] })
		const guess = (as: typeof admin, teamId: string, year: number) =>
			expectData(GUESS, {
				as,
				variables: { puzzleId: ctx.puzzle.id, teamId, year },
			})

		await guess(admin, ctx.answerTeam.id, 2003)
		await guess(admin, ctx.answerTeam.id, 2007)
		await guess(member, ctx.answerTeam.id, 2007)

		const data = await expectData<BoardResult>(BOARD, {
			as: admin,
			variables: { groupId: group.id },
		})
		const board = data.group?.seasonPuzzleBoard
		expect(board?.today.map((r) => [r.user.id, r.status, r.squares])).toEqual([
			[member.id, "SOLVED", ["HIT"]],
			[admin.id, "SOLVED", ["CLOSE", "HIT"]],
			[idle.id, "NOT_PLAYED", []],
		])
		expect(data.group?.arcadeWeek?.[0]).toEqual({
			user: { id: member.id },
			points: 6,
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
		const data = result.data as BoardResult | null
		expect(data?.group?.seasonPuzzleBoard ?? null).toBeNull()
	})
})
