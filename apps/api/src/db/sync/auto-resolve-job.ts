import {
	type ApplyContext,
	applyDecision,
	isAttemptDue,
} from "../../lib/auto-resolve/apply"
import type { Decision } from "../../lib/auto-resolve/decide"
import type { Question } from "../schema"
import {
	defaultEspnClient,
	type EspnClient,
	EspnRequestError,
} from "./espn-client"
import {
	createEspnRequester,
	DEFAULT_ESPN_SPACING_MS,
	type EspnRequester,
} from "./espn-requester"

export type AutoResolveJobOptions = {
	now?: Date
	spacingMs?: number
	espn?: EspnClient
}

// What each group of questions is settled with: one requester shared across
// the whole run, so spacing and the request count span every group.
export type AutoResolveRun = {
	now: Date
	espn: EspnClient
	requester: EspnRequester
}

type Phase = "unsettled" | "recheck"

type QuestionStatus = Question["status"]

const dueWhere = (now: Date, phase: Phase) =>
	phase === "unsettled"
		? {
				status: { in: ["open", "locked"] as QuestionStatus[] },
				locksAt: { lte: now },
			}
		: {
				resolutionMethod: "system" as const,
				status: { in: ["resolved", "voided"] as QuestionStatus[] },
				autoResolution: {
					recheckDueAt: { lte: now },
					recheckedAt: { isNull: true as const },
				},
			}

// The questions an automatic resolver reads this run: the ones still waiting on
// a result, and settled ones whose re-check is due, less any backing off after
// a failure or already handed to an admin. `find` adds the resolver's own
// filters to each phase's where.
export async function loadDueCandidates<
	Q extends Parameters<typeof isAttemptDue>[0],
>(
	now: Date,
	find: (due: ReturnType<typeof dueWhere>, phase: Phase) => PromiseLike<Q[]>,
): Promise<Q[]> {
	const [unsettled, awaitingRecheck] = await Promise.all([
		find(dueWhere(now, "unsettled"), "unsettled"),
		find(dueWhere(now, "recheck"), "recheck"),
	])
	return [...unsettled, ...awaitingRecheck].filter((question) =>
		isAttemptDue(question, now),
	)
}

// Applies decisions for one group under a shared context, varying only the
// ESPN page each result links to (null when there isn't one).
export function applierFor(
	group: { id: string }[],
	base: Omit<ApplyContext, "resolutionSourceUrl">,
) {
	const apply = (
		questionId: string,
		decision: Decision,
		resolutionSourceUrl: string | null = null,
	) => applyDecision(questionId, decision, { ...base, resolutionSourceUrl })
	const applyAll = async (decision: Decision) => {
		for (const question of group) await apply(question.id, decision)
	}
	return { apply, applyAll }
}

// The run every automatic resolver shares: load what's due, group it by the
// ESPN page it settles from, and read each group's page once. ESPN refusing us
// ends the run; any other failure is that one group's problem.
export async function runAutoResolveJob<Q>(
	job: {
		name: string
		// What a group is, for the log lines ("game", "season").
		unit: string
		loadCandidates: (now: Date) => Promise<Q[]>
		groupKey: (question: Q) => string | null
		processGroup: (group: Q[], run: AutoResolveRun) => Promise<void>
	},
	{
		now = new Date(),
		spacingMs = DEFAULT_ESPN_SPACING_MS,
		espn = defaultEspnClient,
	}: AutoResolveJobOptions,
): Promise<void> {
	const candidates = await job.loadCandidates(now)
	if (candidates.length === 0) {
		console.log(`[${job.name}] nothing due`)
		return
	}

	const groups = new Map<string, Q[]>()
	for (const question of candidates) {
		const key = job.groupKey(question)
		if (key === null) continue
		groups.set(key, [...(groups.get(key) ?? []), question])
	}

	const requester = createEspnRequester(job.name, spacingMs)
	for (const [key, group] of groups) {
		try {
			await job.processGroup(group, { now, espn, requester })
		} catch (err) {
			if (err instanceof EspnRequestError) throw err
			console.error(`[${job.name}] ${job.unit} ${key} failed:`, err)
		}
	}

	console.log(
		`[${job.name}] ${candidates.length} question(s) across ${groups.size} ${job.unit}(s), ${requester.count()} ESPN request(s)`,
	)
}
