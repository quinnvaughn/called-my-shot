import { questionTitleWithGame } from "@called-my-shot/schemas"
import type { db } from "../db"
import { notifications } from "../db/schema"

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

export type NotificationInput =
	| {
			type: "call_resolved"
			userId: string
			questionId: string
			questionTitle: string
			pointsDelta: number
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

function toRow(input: NotificationInput) {
	return {
		userId: input.userId,
		type: input.type,
		actorId: "actorId" in input ? input.actorId : null,
		questionId: "questionId" in input ? input.questionId : null,
		questionTitle: "questionTitle" in input ? input.questionTitle : null,
		groupId: "groupId" in input ? input.groupId : null,
		groupName: "groupName" in input ? input.groupName : null,
		actorUsername: "actorUsername" in input ? input.actorUsername : null,
		disputeId: "disputeId" in input ? input.disputeId : null,
		pointsDelta: input.type === "call_resolved" ? input.pointsDelta : null,
		strikeCount:
			input.type === "question_voided" ? (input.strikeCount ?? null) : null,
	}
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

export async function createNotifications(tx: Tx, inputs: NotificationInput[]) {
	if (inputs.length === 0) return
	const titled = await withGameTitles(tx, inputs)
	await tx.insert(notifications).values(titled.map(toRow))
}
