import { describe, expect, it } from "vitest"
import {
	futureDate,
	makeCall,
	makeQuestion,
	makeUser,
	pastDate,
} from "../test/factories"
import { suggestedFirstQuestion } from "./onboarding"

// suggestedFirstQuestion is what absorbs the "will there even be a game
// tonight?" problem for the onboarding checklist. The client renders whatever
// comes back, so everything about which question a new user is pointed at -
// and the guarantee that they're never pointed at a dead one - is pinned here.

describe("suggestedFirstQuestion", () => {
	it("prefers an official binary question locking within the horizon", async () => {
		const user = await makeUser()
		// A season award locking sooner, to prove the ladder ranks by rung
		// first and only breaks ties inside a rung by locksAt. Without that
		// ordering the ideal two-option call would lose to anything at all
		// that happened to lock earlier.
		await makeQuestion({
			shape: "player_season_award",
			isOfficial: true,
			locksAt: futureDate(1),
		})
		const gameWinner = await makeQuestion({
			shape: "team_vs_team",
			isOfficial: true,
			locksAt: futureDate(3),
		})

		const suggested = await suggestedFirstQuestion(user.id)

		expect(suggested?.id).toBe(gameWinner.id)
	})

	it("picks the soonest of several eligible binary questions", async () => {
		const user = await makeUser()
		const later = await makeQuestion({
			shape: "yes_no_prop",
			isOfficial: true,
			locksAt: futureDate(20),
		})
		const sooner = await makeQuestion({
			shape: "yes_no_prop",
			isOfficial: true,
			locksAt: futureDate(2),
		})

		const suggested = await suggestedFirstQuestion(user.id)

		expect(suggested?.id).toBe(sooner.id)
		expect(suggested?.id).not.toBe(later.id)
	})

	it("falls back to a season-long official question in the offseason", async () => {
		const user = await makeUser()
		// Locks in three weeks, well past the 48-hour "soon" horizon, so rung
		// one finds nothing. This is the offseason case: no games scheduled,
		// only award and win-total questions left standing.
		const award = await makeQuestion({
			shape: "player_season_award",
			isOfficial: true,
			locksAt: futureDate(24 * 21),
		})

		const suggested = await suggestedFirstQuestion(user.id)

		expect(suggested?.id).toBe(award.id)
	})

	it("falls back to a user-posted question when nothing official is open", async () => {
		const user = await makeUser()
		const poster = await makeUser()
		const userPosted = await makeQuestion({
			isOfficial: false,
			creatorId: poster.id,
			locksAt: futureDate(5),
		})

		const suggested = await suggestedFirstQuestion(user.id)

		expect(suggested?.id).toBe(userPosted.id)
	})

	it("skips a question the viewer has already called", async () => {
		const user = await makeUser()
		const alreadyCalled = await makeQuestion({
			shape: "team_vs_team",
			isOfficial: true,
			locksAt: futureDate(2),
		})
		await makeCall(alreadyCalled.id, user.id)
		const untouched = await makeQuestion({
			shape: "team_vs_team",
			isOfficial: true,
			locksAt: futureDate(4),
		})

		const suggested = await suggestedFirstQuestion(user.id)

		expect(suggested?.id).toBe(untouched.id)
	})

	it("still suggests a question someone else has called", async () => {
		const user = await makeUser()
		const other = await makeUser()
		const question = await makeQuestion({
			shape: "team_vs_team",
			isOfficial: true,
			locksAt: futureDate(2),
		})
		await makeCall(question.id, other.id)

		const suggested = await suggestedFirstQuestion(user.id)

		expect(suggested?.id).toBe(question.id)
	})

	it("ignores a question left status open whose locksAt has already passed", async () => {
		const user = await makeUser()
		// Nothing flips status off "open" the instant locksAt passes - a cron
		// sweeps every 15 minutes - so this row is a real state the database
		// sits in, not a contrived one. castCall would reject a call on it.
		await makeQuestion({
			shape: "team_vs_team",
			isOfficial: true,
			status: "open",
			locksAt: pastDate(1),
		})

		const suggested = await suggestedFirstQuestion(user.id)

		expect(suggested).toBeNull()
	})

	it("ignores locked and resolved questions", async () => {
		const user = await makeUser()
		await makeQuestion({ status: "locked", locksAt: futureDate(2) })
		await makeQuestion({ status: "resolved", locksAt: futureDate(3) })

		const suggested = await suggestedFirstQuestion(user.id)

		expect(suggested).toBeNull()
	})

	it("returns null when the catalogue is empty", async () => {
		const user = await makeUser()

		const suggested = await suggestedFirstQuestion(user.id)

		expect(suggested).toBeNull()
	})
})
