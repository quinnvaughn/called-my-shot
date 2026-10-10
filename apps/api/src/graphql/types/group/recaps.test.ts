import { eq } from "drizzle-orm"
import { describe, expect, it } from "vitest"
import { db } from "../../../db"
import { callSelections, type GroupRecap, type User } from "../../../db/schema"
import {
	ensureGroupRecap,
	generateGroupRecaps,
	reviseGroupRecap,
} from "../../../lib/group-recap/generate"
import { weekContaining } from "../../../lib/group-recap/week"
import {
	makeCall,
	makeGame,
	makeGroup,
	makeLeague,
	makeOption,
	makeQuestion,
	makeSeason,
	makeUser,
} from "../../../test/factories"
import { execute, expectData } from "../../../test/graphql"

// A group's weekly recap: made from the week's settled calls, frozen apart
// from a few days of revisions, and readable by anyone holding its link
// unless the group's admins turn links off.

const WEEK = weekContaining(new Date("2026-10-08T12:00:00Z"))
const GAME_START = new Date("2026-10-10T17:00:00Z")

async function setup() {
	const league = await makeLeague()
	const season = await makeSeason({ leagueId: league.id })
	const admin = await makeUser()
	const member = await makeUser()
	const group = await makeGroup({
		admin,
		members: [member],
		leagueIds: [league.id],
	})
	return { league, season, admin, member, group }
}

// A yes/no question on a game that went final inside WEEK, with each pick
// already scored.
async function settledQuestion(
	ctx: Awaited<ReturnType<typeof setup>>,
	picks: { user: User; yes: boolean; points: number; conviction?: number }[],
) {
	const game = await makeGame({
		leagueId: ctx.league.id,
		seasonId: ctx.season.id,
		startsAt: GAME_START,
		status: "final",
		finalizedAt: new Date(GAME_START.getTime() + 3 * 60 * 60 * 1000),
	})
	const question = await makeQuestion({
		leagueId: ctx.league.id,
		seasonId: ctx.season.id,
		gameId: game.id,
		locksAt: GAME_START,
		status: "resolved",
		resolvedAt: new Date(GAME_START.getTime() + 4 * 60 * 60 * 1000),
	})
	const yes = await makeOption(question.id, { label: "Yes", isCorrect: true })
	const no = await makeOption(question.id, { label: "No", isCorrect: false })
	const calls = []
	for (const pick of picks) {
		const call = await makeCall(question.id, pick.user.id, {
			createdAt: new Date(GAME_START.getTime() - 60 * 60 * 1000),
		})
		const [selection] = await db
			.insert(callSelections)
			.values({
				callId: call.id,
				optionId: pick.yes ? yes.id : no.id,
				conviction: pick.conviction ?? 80,
				resultPoints: pick.points,
			})
			.returning()
		calls.push({ call, selection })
	}
	return { question, calls }
}

const RECAP = /* GraphQL */ `
	query Recap($token: String!) {
		groupRecap(token: $token) {
			weekLabel
			groupName
			groupId
			shareToken
			record { wins losses activeMembers accuracy }
			tiles { kind label value tone headline note user { username } }
		}
	}
`

type RecapResult = {
	groupRecap: {
		weekLabel: string
		groupName: string
		groupId: string | null
		shareToken: string | null
		record: {
			wins: number
			losses: number
			activeMembers: number
			accuracy: number | null
		}
		tiles: {
			kind: string
			label: string
			value: string
			tone: string
			headline: string
			note: string
			user: { username: string } | null
		}[]
	} | null
}

describe("ensureGroupRecap", () => {
	it("makes a recap once for a week two members called in", async () => {
		const ctx = await setup()
		await settledQuestion(ctx, [
			{ user: ctx.admin, yes: true, points: 30 },
			{ user: ctx.member, yes: false, points: -12 },
		])

		const recap = await ensureGroupRecap(ctx.group.id, WEEK)
		expect(recap?.data.record).toEqual({ wins: 1, losses: 1, activeMembers: 2 })
		expect(recap?.data.bestCalls.map((c) => c.userId)).toEqual([ctx.admin.id])
		expect(recap?.data.worstMisses.map((c) => c.userId)).toEqual([
			ctx.member.id,
		])

		expect(await ensureGroupRecap(ctx.group.id, WEEK)).toBeNull()
	})

	it("skips a week only one member called in", async () => {
		const ctx = await setup()
		await settledQuestion(ctx, [{ user: ctx.admin, yes: true, points: 30 }])
		expect(await ensureGroupRecap(ctx.group.id, WEEK)).toBeNull()
	})

	it("leaves out a week whose results landed outside it", async () => {
		const ctx = await setup()
		await settledQuestion(ctx, [
			{ user: ctx.admin, yes: true, points: 30 },
			{ user: ctx.member, yes: false, points: -12 },
		])
		const nextWeek = weekContaining(new Date("2026-10-15T12:00:00Z"))
		expect(await ensureGroupRecap(ctx.group.id, nextWeek)).toBeNull()
	})
})

describe("generateGroupRecaps", () => {
	it("makes last week's recap on the Tuesday after", async () => {
		const ctx = await setup()
		await settledQuestion(ctx, [
			{ user: ctx.admin, yes: true, points: 30 },
			{ user: ctx.member, yes: false, points: -12 },
		])
		const result = await generateGroupRecaps(new Date("2026-10-13T09:00:00Z"))
		expect(result.created).toBe(1)
	})

	it("skips a week that ended too long ago to be news", async () => {
		const ctx = await setup()
		await settledQuestion(ctx, [
			{ user: ctx.admin, yes: true, points: 30 },
			{ user: ctx.member, yes: false, points: -12 },
		])
		// Sunday: WEEK is still the last completed one, but it ended five days
		// ago.
		const result = await generateGroupRecaps(new Date("2026-10-18T09:00:00Z"))
		expect(result.created).toBe(0)
		const rows = await db.query.groupRecaps.findMany({
			where: { groupId: ctx.group.id },
		})
		expect(rows).toEqual([])
	})
})

describe("reviseGroupRecap", () => {
	it("rewrites the recap when a result under it moves", async () => {
		const ctx = await setup()
		const { calls } = await settledQuestion(ctx, [
			{ user: ctx.admin, yes: true, points: 30 },
			{ user: ctx.member, yes: false, points: -12 },
		])
		const recap = (await ensureGroupRecap(ctx.group.id, WEEK)) as GroupRecap
		expect(await reviseGroupRecap(recap)).toBe(false)

		const winner = calls[0]?.selection
		if (!winner) throw new Error("no selection")
		await db
			.update(callSelections)
			.set({ resultPoints: 45 })
			.where(eq(callSelections.id, winner.id))
		expect(await reviseGroupRecap(recap)).toBe(true)

		const after = await db.query.groupRecaps.findFirst({
			where: { id: recap.id },
		})
		expect(after?.version).toBe(2)
		expect(after?.data.bestCalls[0]?.points).toBe(45)
	})
})

describe("groupRecap", () => {
	it("reads a recap by its token, signed out", async () => {
		const ctx = await setup()
		await settledQuestion(ctx, [
			{ user: ctx.admin, yes: true, points: 30 },
			{ user: ctx.member, yes: false, points: -12, conviction: 90 },
		])
		const recap = (await ensureGroupRecap(ctx.group.id, WEEK)) as GroupRecap

		const data = await expectData<RecapResult>(RECAP, {
			as: null,
			variables: { token: recap.shareToken },
		})
		expect(data.groupRecap).toMatchObject({
			weekLabel: "Oct 6 to 12",
			groupName: ctx.group.name,
			groupId: null,
			shareToken: recap.shareToken,
			record: { wins: 1, losses: 1, activeMembers: 2, accuracy: 50 },
		})
		expect(data.groupRecap?.tiles).toEqual([
			expect.objectContaining({
				kind: "best_call",
				value: "+30",
				tone: "SUCCESS",
				note: "Picked Yes",
				user: { username: ctx.admin.username },
			}),
			expect.objectContaining({
				kind: "worst_miss",
				value: "−12",
				tone: "DANGER",
				note: "Picked No at 90% conviction",
				user: { username: ctx.member.username },
			}),
		])
	})

	it("tells a member which group it belongs to", async () => {
		const ctx = await setup()
		await settledQuestion(ctx, [
			{ user: ctx.admin, yes: true, points: 30 },
			{ user: ctx.member, yes: false, points: -12 },
		])
		const recap = (await ensureGroupRecap(ctx.group.id, WEEK)) as GroupRecap
		const data = await expectData<RecapResult>(RECAP, {
			as: ctx.member,
			variables: { token: recap.shareToken },
		})
		expect(data.groupRecap?.groupId).toBe(ctx.group.id)
	})

	it("stops answering once the group turns recap links off", async () => {
		const ctx = await setup()
		await settledQuestion(ctx, [
			{ user: ctx.admin, yes: true, points: 30 },
			{ user: ctx.member, yes: false, points: -12 },
		])
		const recap = (await ensureGroupRecap(ctx.group.id, WEEK)) as GroupRecap

		await expectData(UPDATE_SETTINGS, {
			as: ctx.admin,
			variables: {
				input: {
					groupId: ctx.group.id,
					linksEnabled: false,
					showsWorstMiss: true,
				},
			},
		})
		const data = await expectData<RecapResult>(RECAP, {
			as: null,
			variables: { token: recap.shareToken },
		})
		expect(data.groupRecap).toBeNull()
	})
})

const UPDATE_SETTINGS = /* GraphQL */ `
	mutation Update($input: GroupRecapSettingsInput!) {
		updateGroupRecapSettings(input: $input) {
			__typename
			... on GroupPayload {
				group { recapLinksEnabled recapShowsWorstMiss }
			}
		}
	}
`

const SET_HIDDEN = /* GraphQL */ `
	mutation Hide($groupId: ID!, $hidden: Boolean!) {
		setHiddenFromRecaps(groupId: $groupId, hidden: $hidden) {
			__typename
			... on GroupPayload {
				group { viewerHiddenFromRecaps }
			}
		}
	}
`

describe("recap settings", () => {
	it("is admin-only", async () => {
		const ctx = await setup()
		const data = await expectData<{
			updateGroupRecapSettings: { __typename: string }
		}>(UPDATE_SETTINGS, {
			as: ctx.member,
			variables: {
				input: {
					groupId: ctx.group.id,
					linksEnabled: false,
					showsWorstMiss: false,
				},
			},
		})
		expect(data.updateGroupRecapSettings.__typename).toBe("AuthorizationError")
	})

	it("hides the worst miss on a recap already made", async () => {
		const ctx = await setup()
		await settledQuestion(ctx, [
			{ user: ctx.admin, yes: true, points: 30 },
			{ user: ctx.member, yes: false, points: -12 },
		])
		const recap = (await ensureGroupRecap(ctx.group.id, WEEK)) as GroupRecap
		await expectData(UPDATE_SETTINGS, {
			as: ctx.admin,
			variables: {
				input: {
					groupId: ctx.group.id,
					linksEnabled: true,
					showsWorstMiss: false,
				},
			},
		})
		const data = await expectData<RecapResult>(RECAP, {
			as: null,
			variables: { token: recap.shareToken },
		})
		expect(data.groupRecap?.tiles.map((t) => t.kind)).toEqual(["best_call"])
	})

	it("keeps a member who opted out off every slot", async () => {
		const ctx = await setup()
		await settledQuestion(ctx, [
			{ user: ctx.admin, yes: true, points: 30 },
			{ user: ctx.member, yes: false, points: -12 },
		])
		const recap = (await ensureGroupRecap(ctx.group.id, WEEK)) as GroupRecap

		const hidden = await expectData<{
			setHiddenFromRecaps: { group: { viewerHiddenFromRecaps: boolean } }
		}>(SET_HIDDEN, {
			as: ctx.member,
			variables: { groupId: ctx.group.id, hidden: true },
		})
		expect(hidden.setHiddenFromRecaps.group.viewerHiddenFromRecaps).toBe(true)

		const data = await expectData<RecapResult>(RECAP, {
			as: null,
			variables: { token: recap.shareToken },
		})
		expect(data.groupRecap?.tiles.map((t) => t.user?.username ?? null)).toEqual(
			[ctx.admin.username],
		)
		// The week's totals still count them.
		expect(data.groupRecap?.record.activeMembers).toBe(2)
	})

	it("refuses an opt-out from someone outside the group", async () => {
		const ctx = await setup()
		const outsider = await makeUser()
		const result = await execute(SET_HIDDEN, {
			as: outsider,
			variables: { groupId: ctx.group.id, hidden: true },
		})
		expect(
			(result.data as { setHiddenFromRecaps: { __typename: string } })
				.setHiddenFromRecaps.__typename,
		).toBe("AuthorizationError")
	})
})
