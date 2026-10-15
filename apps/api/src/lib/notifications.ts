import { questionTitleWithGame } from "@called-my-shot/schemas"
import type { StreakFamily } from "@called-my-shot/scoring"
import { sql } from "drizzle-orm"
import { match } from "ts-pattern"
import { notifications } from "../db/schema"
import type { Tx } from "../db/types"
import { enqueuePushes } from "./push-outbox"

export type NotificationInput =
	// A call on a question with no game. One on a game's question is told as
	// part of that game's game_resolved instead.
	| {
			type: "call_resolved"
			userId: string
			questionId: string
			questionTitle: string
			pointsDelta: number
			callId: string | null
	  }
	| {
			type: "dispute_filed"
			userId: string
			questionId: string
			questionTitle: string
			actorId: string
			actorUsername: string
			disputeId: string
	  }
	| {
			type: "dispute_upheld" | "dispute_overturned"
			userId: string
			questionId: string
			questionTitle: string
			disputeId: string
	  }
	| {
			type: "question_voided"
			userId: string
			questionId: string
			questionTitle: string
			strikeCount?: number
	  }
	| {
			type: "call_voided"
			userId: string
			questionId: string
			questionTitle: string
	  }
	| {
			type: "group_member_joined"
			userId: string
			groupId: string
			groupName: string
			actorId: string
			actorUsername: string
	  }
	| {
			type: "question_shared_to_group"
			userId: string
			groupId: string
			groupName: string
			questionId: string
			questionTitle: string
			actorId: string
			actorUsername: string
	  }
	| {
			type: "sweep_completed"
			userId: string
			leagueId: string
			slateKey: string
			achievementLabel: string
			achievementCount: number
	  }
	| {
			type: "streak_milestone" | "streak_snapped"
			userId: string
			leagueId: string
			streakFamily: StreakFamily
			achievementLabel: string
			achievementCount: number
	  }
	| {
			type: "streak_personal_best"
			userId: string
			leagueId: string
			streakFamily: StreakFamily
			achievementLabel: string
			achievementCount: number
			previousBest: number
	  }
	| {
			type: "game_reminder"
			userId: string
			gameId: string
			// Picked ahead when a push announcing it goes out first, so the push
			// can name what to mark read once it's tapped.
			id?: string
	  }
	// The referrer's side of an invite. Sent when the person they invited
	// makes their first call, which is the moment the redo actually lands.
	//
	// Only the referrer gets one. The invitee's welcome redo is granted
	// during signup, where the toast on AuthPayload.redoGranted tells them
	// then and there - a notification would be this account's very first, for
	// something they were just told about seconds earlier.
	| {
			type: "redo_earned"
			userId: string
			actorId: string
			actorUsername: string
	  }
	// To a group's admins, when the last of its callable pins locks.
	| {
			type: "group_pins_expired"
			userId: string
			groupId: string
			groupName: string
	  }
	// One of the recipient's calls on a game settled. One notification per
	// recipient and game however many of their calls it covers: each later
	// one marks it unread and moves it back to the top. What it says is read
	// live off the calls, so it never needs rewriting.
	| {
			type: "game_resolved"
			userId: string
			gameId: string
	  }
	// To a presser's owner. One per presser: each later question marks it
	// unread and moves it back to the top, and the count it shows is read
	// live. The actor is whoever asked last.
	| {
			type: "presser_question_received"
			userId: string
			presserId: string
			gameId: string
			actorId: string
			actorUsername: string
	  }
	// To the asker, when the owner answers their question, "No comment"
	// included.
	| {
			type: "presser_answered"
			userId: string
			presserId: string
			gameId: string
			actorId: string
			actorUsername: string
	  }
	// To a challenge's creator. One per challenge: each later acceptance
	// marks it unread and moves it back to the top, and the count it shows is
	// read live. The actor is whoever accepted last.
	| {
			type: "challenge_accepted"
			userId: string
			challengeId: string
			actorId: string
			actorUsername: string
	  }
	// To everyone in a challenge once every question in it has a result, or
	// all of them were voided. An overturn that changes a result marks it
	// unread again. How it went is read live.
	| {
			type: "challenge_settled"
			userId: string
			challengeId: string
	  }
	// To whoever a gloat was sent at. The actor is the sender.
	| {
			type: "challenge_gloated"
			userId: string
			challengeId: string
			actorId: string
			actorUsername: string
	  }
	| {
			type: "challenge_posted_to_group"
			userId: string
			challengeId: string
			groupId: string
			groupName: string
			actorId: string
			actorUsername: string
	  }

function toRow(input: NotificationInput) {
	return {
		id: "id" in input ? input.id : undefined,
		userId: input.userId,
		type: input.type,
		actorId: "actorId" in input ? input.actorId : null,
		questionId: "questionId" in input ? input.questionId : null,
		questionTitle: "questionTitle" in input ? input.questionTitle : null,
		groupId: "groupId" in input ? input.groupId : null,
		groupName: "groupName" in input ? input.groupName : null,
		actorUsername: "actorUsername" in input ? input.actorUsername : null,
		disputeId: "disputeId" in input ? input.disputeId : null,
		gameId: "gameId" in input ? input.gameId : null,
		callId: "callId" in input ? input.callId : null,
		pointsDelta: input.type === "call_resolved" ? input.pointsDelta : null,
		strikeCount:
			input.type === "question_voided" ? (input.strikeCount ?? null) : null,
		leagueId: "leagueId" in input ? input.leagueId : null,
		streakFamily: "streakFamily" in input ? input.streakFamily : null,
		slateKey: "slateKey" in input ? input.slateKey : null,
		achievementLabel:
			"achievementLabel" in input ? input.achievementLabel : null,
		achievementCount:
			"achievementCount" in input ? input.achievementCount : null,
		previousBest: "previousBest" in input ? input.previousBest : null,
		presserId: "presserId" in input ? input.presserId : null,
		challengeId: "challengeId" in input ? input.challengeId : null,
		dedupeKey: dedupeKeyFor(input),
	}
}

// The types updated in place rather than added again. Keys share one unique
// index per recipient across every type, so each but game_resolved's (which
// predates the rest) carries its type as a prefix.
function dedupeKeyFor(input: NotificationInput): string | null {
	return match(input)
		.with({ type: "game_resolved" }, ({ gameId }) => gameId)
		.with(
			{ type: "presser_question_received" },
			({ presserId }) => `presser:${presserId}`,
		)
		.with(
			{ type: "challenge_accepted" },
			{ type: "challenge_settled" },
			{ type: "challenge_gloated" },
			({ type, challengeId }) => `${type}:${challengeId}`,
		)
		.otherwise(() => null)
}

// A notification is read on its own, with nothing else on screen naming the
// game, so a game question's title is stored with its matchup in front (see
// questionTitleWithGame). Looked up here once rather than at every caller.
async function withGameTitles(
	tx: Tx,
	inputs: NotificationInput[],
): Promise<NotificationInput[]> {
	const questionIds = [
		...new Set(
			inputs.flatMap((input) =>
				"questionId" in input ? [input.questionId] : [],
			),
		),
	]
	if (questionIds.length === 0) return inputs

	const rows = await tx.query.questions.findMany({
		where: { id: { in: questionIds } },
		columns: { id: true },
		with: {
			game: {
				columns: {},
				with: {
					homeTeam: { columns: { abbreviation: true } },
					awayTeam: { columns: { abbreviation: true } },
				},
			},
		},
	})
	const gameByQuestionId = new Map(rows.map((row) => [row.id, row.game]))

	return inputs.map((input) =>
		"questionTitle" in input
			? {
					...input,
					questionTitle: questionTitleWithGame(
						input.questionTitle,
						gameByQuestionId.get(input.questionId),
					),
				}
			: input,
	)
}

export async function createNotification(tx: Tx, input: NotificationInput) {
	await createNotifications(tx, [input])
}

export async function createNotifications(
	tx: Tx,
	inputs: NotificationInput[],
): Promise<{ id: string }[]> {
	if (inputs.length === 0) return []
	const titled = await withGameTitles(tx, inputs)
	// One statement can't insert and then update the same row, so a batch
	// repeating a recipient's dedupe key keeps only its last.
	const rows = [
		...new Map(
			titled
				.map(toRow)
				.map((row, i) => [
					row.dedupeKey === null ? i : `${row.userId}:${row.dedupeKey}`,
					row,
				]),
		).values(),
	]
	// Rows without a dedupe key never conflict: nulls are distinct.
	const written = await tx
		.insert(notifications)
		.values(rows)
		.onConflictDoUpdate({
			target: [notifications.userId, notifications.dedupeKey],
			set: { readAt: null, createdAt: sql`now()` },
		})
		.returning({
			id: notifications.id,
			userId: notifications.userId,
			type: notifications.type,
			gameId: notifications.gameId,
			callId: notifications.callId,
			leagueId: notifications.leagueId,
			slateKey: notifications.slateKey,
			dedupeKey: notifications.dedupeKey,
		})
	await enqueuePushes(tx, written, new Date())
	return written.map(({ id }) => ({ id }))
}
