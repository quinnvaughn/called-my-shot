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

export async function createNotification(tx: Tx, input: NotificationInput) {
	await tx.insert(notifications).values(toRow(input))
}

export async function createNotifications(tx: Tx, inputs: NotificationInput[]) {
	if (inputs.length === 0) return
	await tx.insert(notifications).values(inputs.map(toRow))
}
