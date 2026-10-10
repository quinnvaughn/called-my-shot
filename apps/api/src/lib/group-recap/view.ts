import { createHash } from "node:crypto"
import { STREAK_FAMILY_LABEL } from "@called-my-shot/scoring"
import { match } from "ts-pattern"
import { db } from "../../db"
import type { Group, GroupRecap, User } from "../../db/schema"
import { formatSlateLabel, parseSlateKey } from "../streaks/slate"
import type {
	GroupRecapData,
	RecapCall,
	RecapMoment,
	RecapMomentKind,
	RecapMover,
} from "./types"
import { formatWeekLabel } from "./week"

// Which kinds of moment a recap leads with when several happened. Rarest and
// most pointed first, so a quiet week still fills from the common ones at the
// bottom.
export const MOMENT_PRIORITY: RecapMomentKind[] = [
	"sweep",
	"redo_backfired",
	"lone_correct",
	"consensus_miss",
	"redo_paid_off",
	"streak_ended",
	"fade_hit",
	"called_early",
	"longest_streak",
]

export const RECAP_MOMENTS_SHOWN = 2

export type RecapSelection = {
	// Every visible call tied for the top, so usually one and sometimes more.
	best: RecapCall[]
	worst: RecapCall[]
	moments: RecapMoment[]
	climber: RecapMover | null
	slide: RecapMover | null
}

function momentUsers(moment: RecapMoment): string[] {
	if (moment.kind === "consensus_miss") return []
	if (moment.kind === "fade_hit") return [moment.userId, moment.targetUserId]
	return [moment.userId]
}

// Candidates arrive best first, so the top is the first one's points.
function tiedForTop(calls: RecapCall[]): RecapCall[] {
	const first = calls[0]
	return first ? calls.filter((c) => c.points === first.points) : []
}

// The pure half of reading a recap: which of its candidates can be shown
// now. `visible` is the members who haven't opted out, so a member who left
// the group drops out the same way.
export function selectRecapSlots(
	data: GroupRecapData,
	{ visible, showWorstMiss }: { visible: Set<string>; showWorstMiss: boolean },
): RecapSelection {
	const shown = (call: RecapCall) => visible.has(call.userId)

	const moments: RecapMoment[] = []
	for (const kind of MOMENT_PRIORITY) {
		if (moments.length >= RECAP_MOMENTS_SHOWN) break
		const pick = data.moments.find(
			(m) => m.kind === kind && momentUsers(m).every((id) => visible.has(id)),
		)
		if (pick) moments.push(pick)
	}

	const movers = data.movers.filter((m) => visible.has(m.userId))
	const climb = (m: RecapMover) => m.from - m.to
	const climber = movers
		.filter((m) => climb(m) > 0)
		.reduce<RecapMover | null>(
			(best, m) => (!best || climb(m) > climb(best) ? m : best),
			null,
		)
	const slide = movers
		.filter((m) => climb(m) < 0)
		.reduce<RecapMover | null>(
			(worst, m) => (!worst || climb(m) < climb(worst) ? m : worst),
			null,
		)

	return {
		best: tiedForTop(data.bestCalls.filter(shown)),
		worst: showWorstMiss ? tiedForTop(data.worstMisses.filter(shown)) : [],
		moments,
		climber,
		slide,
	}
}

export type RecapTileKind = "best_call" | "worst_miss" | RecapMomentKind

type Slot =
	| { kind: "best_call" | "worst_miss"; call: RecapCall }
	| { kind: "moment"; moment: RecapMoment }

type SlotRefs = {
	userId: string | null
	targetUserId: string | null
	callId: string | null
	questionId: string | null
	optionId: string | null
	leagueId: string
}

const NO_REFS = {
	userId: null,
	targetUserId: null,
	callId: null,
	questionId: null,
	optionId: null,
}

// The rows a slot points at, whichever kind it is.
function refsOf(slot: Slot): SlotRefs {
	if (slot.kind !== "moment") {
		const { userId, callId, questionId, leagueId } = slot.call
		return { ...NO_REFS, userId, callId, questionId, leagueId }
	}
	return match(slot.moment)
		.with(
			{ kind: "sweep" },
			{ kind: "streak_ended" },
			{ kind: "longest_streak" },
			({ userId, leagueId }) => ({ ...NO_REFS, userId, leagueId }),
		)
		.with({ kind: "consensus_miss" }, ({ questionId, optionId, leagueId }) => ({
			...NO_REFS,
			questionId,
			optionId,
			leagueId,
		}))
		.with(
			{ kind: "fade_hit" },
			({ userId, targetUserId, callId, questionId, leagueId }) => ({
				...NO_REFS,
				userId,
				targetUserId,
				callId,
				questionId,
				leagueId,
			}),
		)
		.with(
			{ kind: "redo_backfired" },
			{ kind: "redo_paid_off" },
			{ kind: "lone_correct" },
			{ kind: "called_early" },
			({ userId, callId, questionId, leagueId }) => ({
				...NO_REFS,
				userId,
				callId,
				questionId,
				leagueId,
			}),
		)
		.exhaustive()
}

// One slot as the page and the card both draw it. `tone` is the value's
// color: success for something that landed, danger for a miss, neutral for
// a fact.
export type RecapTile = {
	kind: RecapTileKind
	label: string
	// Null for a group miss, which names nobody.
	user: User | null
	value: string
	tone: "success" | "danger" | "neutral"
	headline: string
	note: string
	leagueAbbr: string
	// What the tile links to, when it's about one call.
	callId: string | null
}

export type RecapMoverView = { user: User; from: number; to: number }

export type RecapView = {
	recap: GroupRecap
	group: Group
	weekLabel: string
	record: {
		wins: number
		losses: number
		activeMembers: number
		// Whole percent, null with nothing settled.
		accuracy: number | null
	}
	tiles: RecapTile[]
	climber: RecapMoverView | null
	slide: RecapMoverView | null
	// Changes whenever anything the card draws does, for its url's cache
	// buster. Covers what read time changes too (an opt-out, the worst-miss
	// toggle), which the row's own version can't see.
	cardVersion: string
}

const signed = (points: number) =>
	points >= 0 ? `+${points}` : `−${Math.abs(points)}`

const toneOf = (points: number) => (points >= 0 ? "success" : "danger")

function formatGuess(value: number): string {
	return String(Number(value.toFixed(3)))
}

const pluralDays = (n: number) => (n === 1 ? "1 day" : `${n} days`)

// Loads the names and labels the selected slots need, then writes their copy.
// A slot whose call, question or person has since been deleted is dropped
// rather than drawn half empty.
export async function loadRecapView(
	recap: GroupRecap,
	group: Group,
): Promise<RecapView> {
	const members = await db.query.groupMembers.findMany({
		where: { groupId: group.id },
		columns: { userId: true, hiddenFromRecaps: true },
	})
	const selection = selectRecapSlots(recap.data, {
		visible: new Set(
			members.filter((m) => !m.hiddenFromRecaps).map((m) => m.userId),
		),
		showWorstMiss: group.recapShowsWorstMiss,
	})

	const slots: Slot[] = [
		...selection.best.map((call) => ({ kind: "best_call" as const, call })),
		...selection.worst.map((call) => ({ kind: "worst_miss" as const, call })),
		...selection.moments.map((moment) => ({ kind: "moment" as const, moment })),
	]

	const userIds = new Set<string>()
	const callIds = new Set<string>()
	const questionIds = new Set<string>()
	const leagueIds = new Set<string>()
	const optionIds = new Set<string>()
	for (const slot of slots) {
		const refs = refsOf(slot)
		for (const id of [refs.userId, refs.targetUserId]) if (id) userIds.add(id)
		if (refs.callId) callIds.add(refs.callId)
		if (refs.questionId) questionIds.add(refs.questionId)
		if (refs.optionId) optionIds.add(refs.optionId)
		leagueIds.add(refs.leagueId)
	}
	for (const mover of [selection.climber, selection.slide]) {
		if (mover) userIds.add(mover.userId)
	}

	const [users, calls, questions, leagues, options] = await Promise.all([
		userIds.size
			? db.query.users.findMany({ where: { id: { in: [...userIds] } } })
			: [],
		callIds.size
			? db.query.calls.findMany({
					where: { id: { in: [...callIds] } },
					columns: { id: true, guessValue: true, conviction: true },
					with: {
						selections: {
							columns: { conviction: true },
							with: { option: { columns: { label: true } } },
						},
						redo: {
							columns: { originalGuessValue: true },
							with: {
								selections: {
									with: { option: { columns: { label: true } } },
								},
							},
						},
					},
				})
			: [],
		questionIds.size
			? db.query.questions.findMany({
					where: { id: { in: [...questionIds] } },
					columns: { id: true, title: true },
					with: {
						game: {
							columns: { id: true },
							with: {
								homeTeam: { columns: { abbreviation: true } },
								awayTeam: { columns: { abbreviation: true } },
							},
						},
					},
				})
			: [],
		leagueIds.size
			? db.query.leagues.findMany({
					where: { id: { in: [...leagueIds] } },
					columns: { id: true, abbreviation: true, slug: true },
				})
			: [],
		optionIds.size
			? db.query.questionOptions.findMany({
					where: { id: { in: [...optionIds] } },
					columns: { id: true, label: true },
				})
			: [],
	])
	const userById = new Map(users.map((u) => [u.id, u]))
	const callById = new Map(calls.map((c) => [c.id, c]))
	// A game's questions are titled for its page, where the matchup is already
	// on screen ("Who will win?"). Out on a recap they need it said.
	const titleById = new Map(
		questions.map((q) => {
			const home = q.game?.homeTeam?.abbreviation
			const away = q.game?.awayTeam?.abbreviation
			return [q.id, home && away ? `${away} @ ${home} · ${q.title}` : q.title]
		}),
	)
	const leagueById = new Map(leagues.map((l) => [l.id, l]))
	const optionLabel = new Map(options.map((o) => [o.id, o.label]))

	const pickOf = (callId: string) => {
		const call = callById.get(callId)
		if (!call) return null
		return call.guessValue !== null
			? formatGuess(call.guessValue)
			: call.selections.map((s) => s.option?.label ?? "").join(" and ")
	}
	const originalPickOf = (callId: string) => {
		const redo = callById.get(callId)?.redo
		if (!redo) return null
		return redo.originalGuessValue !== null
			? formatGuess(redo.originalGuessValue)
			: redo.selections.map((s) => s.option?.label ?? "").join(" and ")
	}
	const convictionOf = (callId: string) => {
		const call = callById.get(callId)
		if (!call) return null
		const all = [
			...(call.conviction !== null ? [call.conviction] : []),
			...call.selections.map((s) => s.conviction),
		]
		return all.length > 0 ? Math.max(...all) : null
	}

	function buildTile(slot: Slot): RecapTile | null {
		const refs = refsOf(slot)
		const league = leagueById.get(refs.leagueId)
		if (!league) return null
		const leagueAbbr = league.abbreviation.toUpperCase()
		const user = refs.userId ? userById.get(refs.userId) : undefined
		if (refs.userId && !user) return null

		// Every kind about one call shares its title and pick.
		const callTitle =
			refs.callId && refs.questionId ? titleById.get(refs.questionId) : ""
		const callPick = refs.callId ? pickOf(refs.callId) : ""
		if (callTitle === undefined || callPick === null) return null
		// Re-bound so the closures below see them narrowed.
		const title: string = callTitle
		const pick: string = callPick
		const base = {
			user: user ?? null,
			leagueAbbr,
			callId: refs.callId,
			headline: title,
		}

		return match(slot)
			.with(
				{ kind: "best_call" },
				({ call: c }): RecapTile => ({
					...base,
					kind: "best_call",
					label: "Best call",
					value: signed(c.points),
					tone: "success",
					note: `Picked ${pick}`,
				}),
			)
			.with({ kind: "worst_miss" }, ({ call: c }): RecapTile => {
				const conviction = convictionOf(c.callId)
				return {
					...base,
					kind: "worst_miss",
					label: "Worst miss",
					value: signed(c.points),
					tone: "danger",
					note:
						conviction !== null
							? `Picked ${pick} at ${conviction}% conviction`
							: `Picked ${pick}`,
				}
			})
			.with({ kind: "moment" }, ({ moment: m }) => momentTile(m))
			.exhaustive()

		function momentTile(m: RecapMoment): RecapTile | null {
			const tile = (
				fields: Omit<RecapTile, "kind" | "user" | "leagueAbbr" | "callId">,
			): RecapTile => ({ ...base, ...fields, kind: m.kind })

			return match(m)
				.with({ kind: "sweep" }, (sweep) => {
					const slate = parseSlateKey(sweep.slateKey)
					return tile({
						label: "Sweep",
						value: `${sweep.gameCount} for ${sweep.gameCount}`,
						tone: "success",
						headline: `${leagueAbbr} ${slate ? formatSlateLabel(slate, league?.slug ?? "") : sweep.slateKey}`,
						note: "Called every winner on the slate.",
					})
				})
				.with({ kind: "redo_backfired" }, { kind: "redo_paid_off" }, (redo) => {
					const original = originalPickOf(redo.callId)
					if (original === null) return null
					const backfired = redo.kind === "redo_backfired"
					return tile({
						label: backfired ? "Redo backfired" : "Redo paid off",
						value: signed(redo.points),
						tone: toneOf(redo.points),
						headline: title,
						note: backfired
							? `Switched from ${original} to ${pick}. ${original} hit.`
							: `Switched from ${original} to ${pick}. ${original} would have missed.`,
					})
				})
				.with({ kind: "lone_correct" }, (lone) =>
					tile({
						label: "Lone correct call",
						value: signed(lone.points),
						tone: "success",
						headline: title,
						note: `Picked ${pick}. The only one of ${lone.callerCount} in the group to get it right.`,
					}),
				)
				.with({ kind: "consensus_miss" }, (miss) => {
					const missTitle = titleById.get(miss.questionId)
					const label = optionLabel.get(miss.optionId)
					if (!missTitle || !label) return null
					return tile({
						label: "Group miss",
						value: `${miss.wrongCount} of ${miss.callerCount}`,
						tone: "danger",
						headline: missTitle,
						note: `${miss.wrongCount} members picked ${label}. It missed.`,
					})
				})
				.with({ kind: "streak_ended" }, (snap) =>
					tile({
						label: "Streak ended",
						value: String(snap.length),
						tone: "neutral",
						headline: `${leagueAbbr} ${STREAK_FAMILY_LABEL[snap.family]}`,
						note: `A run of ${snap.length} straight hits ended.`,
					}),
				)
				.with({ kind: "fade_hit" }, (fade) => {
					const target = userById.get(fade.targetUserId)
					if (!target) return null
					return tile({
						label: "Fade that hit",
						value: signed(fade.points),
						tone: "success",
						headline: title,
						note: `Faded ${target.name} and was right.`,
					})
				})
				.with({ kind: "called_early" }, (early) =>
					tile({
						label: "Called it early",
						value: pluralDays(early.daysAhead),
						tone: "success",
						headline: title,
						note: `Picked ${pick} ${pluralDays(early.daysAhead)} before lock. It hit.`,
					}),
				)
				.with({ kind: "longest_streak" }, (streak) =>
					tile({
						label: "Longest streak",
						value: `${streak.length} in a row`,
						tone: "neutral",
						headline: `${leagueAbbr} ${STREAK_FAMILY_LABEL[streak.family]}`,
						note: "The longest run going in the group.",
					}),
				)
				.exhaustive()
		}
	}

	const tiles = slots.flatMap((slot) => {
		const tile = buildTile(slot)
		return tile ? [tile] : []
	})
	const mover = (m: RecapMover | null): RecapMoverView | null => {
		const user = m ? userById.get(m.userId) : undefined
		return m && user ? { user, from: m.from, to: m.to } : null
	}
	const climber = mover(selection.climber)
	const slide = mover(selection.slide)

	const { wins, losses, activeMembers } = recap.data.record
	const settled = wins + losses
	const record = {
		wins,
		losses,
		activeMembers,
		accuracy: settled > 0 ? Math.round((wins / settled) * 100) : null,
	}

	const cardVersion = createHash("sha256")
		.update(
			JSON.stringify([
				recap.version,
				group.name,
				group.logoKey,
				record,
				tiles.map((t) => [t.kind, t.user?.id, t.value, t.headline, t.note]),
				[climber, slide].map(
					(m) => m && [m.user.id, m.user.name, m.from, m.to],
				),
				tiles.map((t) => t.user?.name),
			]),
		)
		.digest("hex")
		.slice(0, 12)

	return {
		recap,
		group,
		weekLabel: formatWeekLabel({ start: recap.weekStart, end: recap.weekEnd }),
		record,
		tiles,
		climber,
		slide,
		cardVersion,
	}
}
