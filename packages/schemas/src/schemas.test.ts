import { describe, expect, it } from "vitest"
import {
	adminResolveQuestionSchema,
	deleteQuestionSchema,
	editQuestionTitleSchema,
	upholdDisputeSchema,
	voidQuestionSchema,
	voidReasonSchema,
} from "./admin"
import { signInSchema, signUpSchema, usernameSchema } from "./auth"
import {
	attachQuestionToBallotSchema,
	ballotQuestionSchema,
	createBallotSchema,
	updateBallotQuestionSchema,
} from "./ballots"
import {
	createGroupSchema,
	joinGroupSchema,
	updateGroupSchema,
} from "./groups"
import { reportQuestionSchema } from "./report"
import {
	createGameSchema,
	createLeagueSchema,
	createTeamSchema,
	updateGameSchema,
} from "./sports"
import { fileSupportTicketSchema } from "./support"
import {
	changePasswordFormSchema,
	updateNameSchema,
	updatePasswordSchema,
} from "./users"

const UUID = "00000000-0000-4000-8000-000000000000"
const OTHER_UUID = "00000000-0000-4000-8000-000000000001"

const ok = (
	schema: { safeParse: (v: unknown) => { success: boolean } },
	v: unknown,
) => schema.safeParse(v).success

describe("auth schemas", () => {
	it("normalizes a username to lowercase", () => {
		expect(usernameSchema.parse("  QuinnV  ")).toBe("quinnv")
	})

	it("enforces the username character set and length", () => {
		expect(ok(usernameSchema, "ab")).toBe(false)
		expect(ok(usernameSchema, "a".repeat(25))).toBe(false)
		expect(ok(usernameSchema, "quinn_v9")).toBe(true)
		expect(ok(usernameSchema, "quinn-v")).toBe(false)
		expect(ok(usernameSchema, "quinn v")).toBe(false)
		expect(ok(usernameSchema, "quinn.v")).toBe(false)
	})

	it("requires a valid email and an 8+ character password to sign up", () => {
		const valid = {
			name: "Quinn",
			username: "quinnv",
			email: "q@example.com",
			password: "password1",
		}
		expect(ok(signUpSchema, valid)).toBe(true)
		expect(ok(signUpSchema, { ...valid, email: "nope" })).toBe(false)
		expect(ok(signUpSchema, { ...valid, password: "short" })).toBe(false)
		expect(ok(signUpSchema, { ...valid, name: "   " })).toBe(false)
		expect(ok(signUpSchema, { ...valid, name: "x".repeat(81) })).toBe(false)
	})

	it("accepts either an email or a username to sign in", () => {
		expect(ok(signInSchema, { identifier: "quinnv", password: "x" })).toBe(true)
		expect(
			ok(signInSchema, { identifier: "q@example.com", password: "x" }),
		).toBe(true)
		expect(ok(signInSchema, { identifier: "", password: "x" })).toBe(false)
	})
})

describe("user schemas", () => {
	it("bounds the display name", () => {
		expect(ok(updateNameSchema, { name: "Q" })).toBe(false)
		expect(ok(updateNameSchema, { name: "Quinn" })).toBe(true)
		expect(ok(updateNameSchema, { name: "x".repeat(61) })).toBe(false)
	})

	it("requires the current password when changing it", () => {
		expect(
			ok(updatePasswordSchema, {
				currentPassword: "",
				newPassword: "password1",
			}),
		).toBe(false)
		expect(
			ok(updatePasswordSchema, {
				currentPassword: "old",
				newPassword: "password1",
			}),
		).toBe(true)
	})

	it("checks the confirm field only on the client-facing form schema", () => {
		const base = { currentPassword: "old", newPassword: "password1" }
		expect(
			ok(changePasswordFormSchema, { ...base, confirmPassword: "password1" }),
		).toBe(true)
		const mismatch = changePasswordFormSchema.safeParse({
			...base,
			confirmPassword: "password2",
		})
		expect(mismatch.success).toBe(false)
		expect(mismatch.success === false && mismatch.error.issues[0].path).toEqual(
			["confirmPassword"],
		)
		// The server-facing schema has no confirm field to check.
		expect(ok(updatePasswordSchema, base)).toBe(true)
	})
})

describe("group schemas", () => {
	it("bounds the group name", () => {
		expect(ok(createGroupSchema, { name: "A" })).toBe(false)
		expect(ok(createGroupSchema, { name: "The League" })).toBe(true)
		expect(ok(createGroupSchema, { name: "x".repeat(61) })).toBe(false)
	})

	it("tracks every league unless leagues are picked, and dedupes picks", () => {
		expect(createGroupSchema.parse({ name: "The League" }).leagueIds).toEqual(
			[],
		)
		const update = { groupId: UUID, name: "The League", description: "" }
		expect(
			updateGroupSchema.parse({ ...update, leagueIds: [UUID, UUID] }).leagueIds,
		).toEqual([UUID])
		expect(ok(updateGroupSchema, { ...update, leagueIds: ["nba"] })).toBe(false)
	})

	it("holds a rename to the same name rules as creation", () => {
		const update = { groupId: UUID, description: "", leagueIds: [] }
		expect(ok(updateGroupSchema, { ...update, name: "A" })).toBe(false)
		expect(ok(updateGroupSchema, { ...update, name: "  Wolfpack  " })).toBe(true)
	})

	it("keeps the description optional and short", () => {
		expect(ok(createGroupSchema, { name: "The League" })).toBe(true)
		expect(
			ok(createGroupSchema, { name: "The League", description: "x".repeat(200) }),
		).toBe(true)
		expect(
			ok(createGroupSchema, { name: "The League", description: "x".repeat(201) }),
		).toBe(false)
	})

	it("upper-cases an invite code so it can be typed either way", () => {
		expect(joinGroupSchema.parse({ code: " ab12 " }).code).toBe("AB12")
		expect(ok(joinGroupSchema, { code: "abc" })).toBe(false)
		expect(ok(joinGroupSchema, { code: "a".repeat(11) })).toBe(false)
	})
})

describe("support schemas", () => {
	const valid = {
		category: "bug",
		subject: "Something broke",
		message: "Here is what happened when I tried it.",
	}

	it("requires a known category", () => {
		expect(ok(fileSupportTicketSchema, valid)).toBe(true)
		expect(ok(fileSupportTicketSchema, { ...valid, category: "spam" })).toBe(
			false,
		)
	})

	it("bounds the subject and message", () => {
		expect(ok(fileSupportTicketSchema, { ...valid, subject: "no" })).toBe(false)
		expect(
			ok(fileSupportTicketSchema, { ...valid, message: "too short" }),
		).toBe(false)
		expect(
			ok(fileSupportTicketSchema, { ...valid, message: "x".repeat(1001) }),
		).toBe(false)
	})

	it("treats the related URL as optional but validates a provided one", () => {
		expect(fileSupportTicketSchema.parse(valid).relatedUrl).toBe("")
		expect(
			ok(fileSupportTicketSchema, { ...valid, relatedUrl: "https://x.com/a" }),
		).toBe(true)
		expect(ok(fileSupportTicketSchema, { ...valid, relatedUrl: "nope" })).toBe(
			false,
		)
	})
})

describe("report schemas", () => {
	it("reuses the admin void reasons so the two can't drift", () => {
		expect(reportQuestionSchema.shape.reason).toBe(voidReasonSchema)
	})

	it("defaults details to empty and caps their length", () => {
		const parsed = reportQuestionSchema.parse({
			questionId: UUID,
			reason: "off_topic",
		})
		expect(parsed.details).toBe("")
		expect(
			ok(reportQuestionSchema, {
				questionId: UUID,
				reason: "off_topic",
				details: "x".repeat(501),
			}),
		).toBe(false)
	})
})

describe("admin schemas", () => {
	const voidBase = {
		questionId: UUID,
		reason: "off_topic" as const,
		countsAsStrike: true,
	}

	it("requires the linked question when voiding as a duplicate", () => {
		expect(ok(voidQuestionSchema, voidBase)).toBe(true)
		expect(ok(voidQuestionSchema, { ...voidBase, reason: "duplicate" })).toBe(
			false,
		)
		expect(
			ok(voidQuestionSchema, {
				...voidBase,
				reason: "duplicate",
				duplicateOfQuestionId: OTHER_UUID,
			}),
		).toBe(true)
	})

	it("requires countsAsStrike explicitly rather than defaulting it", () => {
		const { countsAsStrike: _omitted, ...withoutToggle } = voidBase
		expect(ok(voidQuestionSchema, withoutToggle)).toBe(false)
	})

	it("mirrors resolveQuestionSchema's per-shape rules", () => {
		expect(
			ok(adminResolveQuestionSchema, {
				shape: "yes_no_prop",
				correctOptionIds: [UUID, OTHER_UUID],
			}),
		).toBe(false)
		expect(
			ok(adminResolveQuestionSchema, {
				shape: "player_stat_numeric_guess",
			}),
		).toBe(false)
	})

	it("lets an admin overwrite the resolution source, normalizing the URL", () => {
		const parsed = adminResolveQuestionSchema.parse({
			shape: "yes_no_prop",
			correctOptionIds: [UUID],
			resolutionSource: "Box score",
			resolutionSourceUrl: "espn.com/box",
		})
		expect(parsed.resolutionSourceUrl).toBe("https://espn.com/box")
	})

	it("caps the notes on the dispute and title mutations", () => {
		expect(ok(upholdDisputeSchema, { disputeId: UUID })).toBe(true)
		expect(
			ok(upholdDisputeSchema, { disputeId: UUID, note: "x".repeat(501) }),
		).toBe(false)
		expect(ok(editQuestionTitleSchema, { questionId: UUID, title: " " })).toBe(
			false,
		)
		expect(ok(deleteQuestionSchema, { questionId: "not-a-uuid" })).toBe(false)
	})
})

describe("ballot schemas", () => {
	it("requires a label but treats slot and section as optional", () => {
		expect(ok(ballotQuestionSchema, { ballotId: UUID, label: "1B" })).toBe(true)
		expect(ok(ballotQuestionSchema, { ballotId: UUID, label: " " })).toBe(false)
		expect(
			ok(ballotQuestionSchema, {
				ballotId: UUID,
				label: "1B",
				slot: "x".repeat(9),
			}),
		).toBe(false)
		expect(
			ok(ballotQuestionSchema, {
				ballotId: UUID,
				label: "1B",
				section: "x".repeat(41),
			}),
		).toBe(false)
	})

	it("adds the question id only on the attach variant", () => {
		expect(
			ok(attachQuestionToBallotSchema, { ballotId: UUID, label: "1B" }),
		).toBe(false)
		expect(
			ok(attachQuestionToBallotSchema, {
				ballotId: UUID,
				label: "1B",
				questionId: OTHER_UUID,
			}),
		).toBe(true)
	})

	it("treats the inline edit as a full replace, so an emptied field clears", () => {
		const parsed = updateBallotQuestionSchema.parse({
			questionId: UUID,
			label: "1B",
		})
		expect(parsed.section).toBeUndefined()
		expect(parsed.slot).toBeUndefined()
	})

	it("asks only for a name and league when creating a ballot", () => {
		expect(
			ok(createBallotSchema, { name: "Gold Gloves", leagueId: UUID }),
		).toBe(true)
		expect(ok(createBallotSchema, { name: " ", leagueId: UUID })).toBe(false)
	})
})

describe("sports admin schemas", () => {
	it("requires a 6-digit hex team color", () => {
		const team = {
			leagueId: UUID,
			name: "Celtics",
			abbreviation: "BOS",
			color: "#007A33",
		}
		expect(ok(createTeamSchema, team)).toBe(true)
		expect(ok(createTeamSchema, { ...team, color: "007A33" })).toBe(false)
		expect(ok(createTeamSchema, { ...team, color: "#FFF" })).toBe(false)
		expect(ok(createTeamSchema, { ...team, color: "red" })).toBe(false)
	})

	it("defaults a league to active", () => {
		expect(
			createLeagueSchema.parse({
				sportId: UUID,
				name: "NBA",
				abbreviation: "NBA",
				slug: "nba",
			}).status,
		).toBe("active")
	})

	const game = {
		leagueId: UUID,
		homeTeamId: UUID,
		awayTeamId: OTHER_UUID,
		startsAt: "2026-03-03T00:00:00.000Z",
	}

	it("rejects a game where a team plays itself", () => {
		expect(ok(createGameSchema, game)).toBe(true)
		expect(ok(createGameSchema, { ...game, awayTeamId: UUID })).toBe(false)
	})

	it("requires both scores once a game is final", () => {
		expect(ok(createGameSchema, { ...game, status: "final" })).toBe(false)
		expect(
			ok(createGameSchema, { ...game, status: "final", homeScore: 100 }),
		).toBe(false)
		expect(
			ok(createGameSchema, {
				...game,
				status: "final",
				homeScore: 100,
				awayScore: 98,
			}),
		).toBe(true)
	})

	it("allows a scheduled game with no scores", () => {
		expect(ok(createGameSchema, { ...game, status: "scheduled" })).toBe(true)
	})

	it("rejects an unparseable start time", () => {
		expect(ok(createGameSchema, { ...game, startsAt: "whenever" })).toBe(false)
	})

	it("applies the same rules to the update variant, plus an id", () => {
		expect(ok(updateGameSchema, game)).toBe(false)
		expect(ok(updateGameSchema, { ...game, id: UUID })).toBe(true)
		expect(ok(updateGameSchema, { ...game, id: UUID, awayTeamId: UUID })).toBe(
			false,
		)
	})
})
