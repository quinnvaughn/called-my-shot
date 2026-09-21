import { readFileSync } from "node:fs"
import { db } from "../db"
import type { Question } from "../db/schema"
import type { MailMessage, MailResult } from "../lib/mailer"
import {
	type ResolveOptions,
	resolveQuestionInternal,
} from "../lib/resolve-question"
import type { SatoriNode } from "../lib/share-image"
import { DAY_MS, HOUR_MS } from "../lib/time"

export const daysAgo = (days: number, from = Date.now()) =>
	new Date(from - days * DAY_MS)
export const hoursAgo = (hours: number, from = Date.now()) =>
	new Date(from - hours * HOUR_MS)
export const hoursFromNow = (hours: number, from = Date.now()) =>
	new Date(from + hours * HOUR_MS)

// resolveQuestionInternal takes a tx, so every call goes through one. Resolves
// as the system unless a test says otherwise.
export function resolve(
	question: Question,
	data: {
		correctOptionIds?: string[]
		actualValue?: number
		resolutionNote?: string
	} = {},
	opts: Partial<ResolveOptions> = {},
) {
	return db.transaction((tx) =>
		resolveQuestionInternal(
			tx,
			question,
			{
				correctOptionIds: data.correctOptionIds ?? [],
				actualValue: data.actualValue,
				resolutionNote: data.resolutionNote ?? "",
			},
			{ resolvedBy: { method: "system" }, ...opts },
		),
	)
}

// Collects what would have gone out, in place of the real Resend sender.
export function mailRecorder(result: MailResult = { ok: true }) {
	const sent: MailMessage[] = []
	return {
		sent,
		send: async (message: MailMessage) => {
			sent.push(message)
			return result
		},
	}
}

// A recorded ESPN response from db/sync/fixtures/espn.
export function espnFixture<T>(name: string): T {
	return JSON.parse(
		readFileSync(
			new URL(`../db/sync/fixtures/espn/${name}`, import.meta.url),
			"utf8",
		),
	) as T
}

// Every string a share card renders, in document order.
export function textNodes(node: SatoriNode, out: string[] = []): string[] {
	const children = node.props.children
	if (typeof children === "string") {
		out.push(children)
	} else if (Array.isArray(children)) {
		for (const child of children as SatoriNode[]) {
			if (child && typeof child === "object") textNodes(child, out)
		}
	} else if (children && typeof children === "object") {
		textNodes(children as SatoriNode, out)
	}
	return out
}
