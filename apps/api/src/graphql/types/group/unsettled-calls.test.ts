import { describe, expect, it } from "vitest"
import {
	makeCall,
	makeGame,
	makeGroup,
	makeLeague,
	makeQuestion,
	makeSeason,
	makeUser,
} from "../../../test/factories"
import { expectData } from "../../../test/graphql"
import { hoursFromNow } from "../../../test/helpers"

const UNSETTLED = /* GraphQL */ `
	query Unsettled($groupId: ID!, $leagueId: ID) {
		group(id: $groupId) {
			viewerUnsettledCalls(leagueId: $leagueId, season: { scope: ALL_TIME }) {
				count
				nextGame { id }
			}
		}
	}
`

type UnsettledData = {
	group: {
		viewerUnsettledCalls: { count: number; nextGame: { id: string } | null }
	}
}

describe("Group.viewerUnsettledCalls", () => {
	it("counts the viewer's unsettled calls in scope and names the soonest game", async () => {
		const viewer = await makeUser()
		const league = await makeLeague()
		const other = await makeLeague()
		const season = await makeSeason({ leagueId: league.id })
		const group = await makeGroup({ admin: viewer })
		const inLeague = { leagueId: league.id, seasonId: season.id }

		const later = await makeGame({ ...inLeague, startsAt: hoursFromNow(48) })
		const sooner = await makeGame({ ...inLeague, startsAt: hoursFromNow(4) })
		const onLater = await makeQuestion({ ...inLeague, gameId: later.id })
		const onSooner = await makeQuestion({ ...inLeague, gameId: sooner.id })
		const seasonLong = await makeQuestion(inLeague)
		const settled = await makeQuestion({ ...inLeague, status: "resolved" })
		const unscored = await makeQuestion(inLeague)
		const elsewhere = await makeQuestion({ leagueId: other.id })
		for (const q of [onLater, onSooner, seasonLong, settled, elsewhere]) {
			await makeCall(q.id, viewer.id)
		}
		await makeCall(unscored.id, viewer.id, {
			unscoredReason: "creator_sole_caller",
		})

		const scoped = await expectData<UnsettledData>(UNSETTLED, {
			as: viewer,
			variables: { groupId: group.id, leagueId: league.id },
		})
		expect(scoped.group.viewerUnsettledCalls).toEqual({
			count: 3,
			nextGame: { id: sooner.id },
		})

		const everywhere = await expectData<UnsettledData>(UNSETTLED, {
			as: viewer,
			variables: { groupId: group.id, leagueId: null },
		})
		expect(everywhere.group.viewerUnsettledCalls.count).toBe(4)
	})

	it("has no game when every unsettled call is season-long", async () => {
		const viewer = await makeUser()
		const group = await makeGroup({ admin: viewer })
		const q = await makeQuestion()
		await makeCall(q.id, viewer.id)

		const data = await expectData<UnsettledData>(UNSETTLED, {
			as: viewer,
			variables: { groupId: group.id, leagueId: null },
		})
		expect(data.group.viewerUnsettledCalls).toEqual({
			count: 1,
			nextGame: null,
		})
	})
})
