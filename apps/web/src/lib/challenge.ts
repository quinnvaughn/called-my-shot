import {
	effectiveLossRate,
	previewNumericPoints,
	previewSelectionPoints,
} from "@called-my-shot/scoring"
import {
	type CallDraft,
	CastCallFormFragment,
} from "#/components/questions/cast-call-form"
import type {
	ImagePlayer,
	ImageTeam,
} from "#/components/ui/player-or-team-image"
import { useFragment as unmask } from "#/graphql/generated"
import type {
	ChallengeEntry_EntryFragment,
	ChallengeMatchupRows_MatchupFragment,
	QuestionShape,
} from "#/graphql/generated/graphql"
import type { CallSummaryData } from "#/lib/call-summary"
import { matchupLabel } from "#/lib/game-status"
import { isNumericQuestionShape } from "#/lib/question-labels"
import { basePointsForGql, previewCrowdPct } from "#/lib/scoring"

export type ChallengeRecord = { wins: number; losses: number; draws: number }

// What a question needs for a draft to read like a call that's been made.
export type DraftQuestion = {
	shape: QuestionShape
	ouLine: number | null
	numericToleranceAbsolute: number | null
	numericTolerancePct: number | null
	stat: {
		toleranceTier: { toleranceMode: string; toleranceValue: number } | null
	} | null
	options: {
		id: string
		label: string
		team?: ImageTeam | null
		player?: ImagePlayer | null
	}[]
}

// A call that hasn't been sent yet, in the shape pickSummary reads.
export function draftSummary(
	question: DraftQuestion,
	draft: CallDraft,
): CallSummaryData {
	const optionById = new Map(question.options.map((o) => [o.id, o]))
	return {
		guessValue: draft.guessValue,
		conviction: draft.conviction,
		totalPoints: null,
		question: {
			shape: question.shape,
			ouLine: question.ouLine,
			numericActualValue: null,
			numericToleranceAbsolute: question.numericToleranceAbsolute,
			numericTolerancePct: question.numericTolerancePct,
			stat: question.stat,
		},
		selections: draft.selections.map((s) => ({
			id: s.optionId,
			conviction: s.conviction,
			option: {
				label: optionById.get(s.optionId)?.label ?? "",
				isCorrect: null,
				team: optionById.get(s.optionId)?.team ?? null,
				player: optionById.get(s.optionId)?.player ?? null,
			},
		})),
	}
}

type Candidate = {
	id: string
	title: string
	locksAt: string
	league: { abbreviation: string }
	game: {
		id: string
		startsAt: string
		awayTeam: { abbreviation: string }
		homeTeam: { abbreviation: string }
	} | null
}

export type CandidateGroup<T extends Candidate> = {
	key: string
	// The game's id, for opening the one the builder was opened from.
	gameId: string | null
	title: string
	startsAt: string | null
	questions: T[]
}

// The builder's questions by where they're played: one group per game,
// soonest first, then one per league for season-long questions. Within a
// group, soonest to lock first.
export function groupCandidates<T extends Candidate>(
	candidates: T[],
): CandidateGroup<T>[] {
	const groups = new Map<string, CandidateGroup<T>>()
	for (const q of candidates) {
		const key = q.game ? `game:${q.game.id}` : `season:${q.league.abbreviation}`
		const group = groups.get(key) ?? {
			key,
			gameId: q.game?.id ?? null,
			title: q.game
				? matchupLabel(q.game)
				: `${q.league.abbreviation} · Season long`,
			startsAt: q.game?.startsAt ?? null,
			questions: [],
		}
		group.questions.push(q)
		groups.set(key, group)
	}
	const byLock = (a: T, b: T) =>
		a.locksAt.localeCompare(b.locksAt) || a.title.localeCompare(b.title)
	return [...groups.values()]
		.map((g) => ({ ...g, questions: [...g.questions].sort(byLock) }))
		.sort((a, b) => {
			if (a.startsAt && b.startsAt) return a.startsAt.localeCompare(b.startsAt)
			if (a.startsAt) return -1
			if (b.startsAt) return 1
			return a.title.localeCompare(b.title)
		})
}

// The one game every question is on, when they all are. Null for a challenge
// spanning games or with a season-long question in it.
export function singleGameOf<G extends { id: string }>(
	questions: { game: G | null }[],
): G | null {
	const first = questions[0]?.game
	if (!first) return null
	return questions.every((q) => q.game?.id === first.id) ? first : null
}

// Team abbreviations by id, for a stat card to name opponents in a game log:
// the same pair the question page hands it.
export function teamLabelsOf(
	game: {
		homeTeam: { id: string; abbreviation: string }
		awayTeam: { id: string; abbreviation: string }
	} | null,
): Record<string, string> {
	return game
		? {
				[game.homeTeam.id]: game.homeTeam.abbreviation,
				[game.awayTeam.id]: game.awayTeam.abbreviation,
			}
		: {}
}

// What a question's scoring reads, as the call form's fragment carries it.
export type ChallengePointsQuestion = {
	shape: QuestionShape
	isOfficial: boolean
	isPriced: boolean
	lossRate: number
	fieldConviction: number
	options: {
		id: string
		convictionTotal: number
		lossRate: number | null
		winMult: number | null
		modelHitRate: number | null
	}[]
}

export type ChallengePointsRange = {
	winLow: number
	winHigh: number
	lose: number
}

// What a call stands to count for in a challenge: the same math it's scored
// by, without the early bonus or the season-play weight, which a challenge
// leaves out (see challengePoints in the api). `isNew` is a call not in yet,
// whose own conviction has to be added to the field the way the call form's
// preview does; one already in is part of the field as it stands. A pick
// against a crowd that's still moving is an estimate until the question
// locks, the same as the call form's own numbers.
export function challengePointsRange(
	question: ChallengePointsQuestion,
	call: {
		conviction: number | null
		selections: { optionId: string; conviction: number }[]
	},
	isNew: boolean,
): ChallengePointsRange | null {
	const base = basePointsForGql(
		question.shape,
		question.isOfficial,
		question.isPriced,
	)
	if (isNumericQuestionShape(question.shape)) {
		if (call.conviction === null) return null
		const p = previewNumericPoints(base, question.lossRate, call.conviction)
		return { winLow: p.winLow, winHigh: p.winHigh, lose: p.lose }
	}
	if (call.selections.length === 0) return null
	let win = 0
	let lose = 0
	for (const s of call.selections) {
		const option = question.options.find((o) => o.id === s.optionId)
		if (!option) continue
		const crowd = isNew
			? previewCrowdPct(
					option.convictionTotal,
					question.fieldConviction,
					s.conviction,
				)
			: question.fieldConviction > 0
				? (option.convictionTotal / question.fieldConviction) * 100
				: 0
		const p = previewSelectionPoints(
			base,
			effectiveLossRate(question.lossRate, option.lossRate),
			crowd,
			question.options.length,
			s.conviction,
			undefined,
			option,
		)
		win += p.win
		lose += p.lose
	}
	return { winLow: win, winHigh: win, lose }
}

// Several calls' ranges as one: what they add together if every one is
// right, what they take away if every one is wrong. Null when none of them
// has a range.
export function sumPointsRanges(
	ranges: (ChallengePointsRange | null)[],
): ChallengePointsRange | null {
	const present = ranges.filter((r): r is ChallengePointsRange => r !== null)
	if (present.length === 0) return null
	return present.reduce((sum, r) => ({
		winLow: sum.winLow + r.winLow,
		winHigh: sum.winHigh + r.winHigh,
		lose: sum.lose + r.lose,
	}))
}

// A call that's in, as the picks challengePointsRange reads.
export function toPicks(call: {
	conviction: number | null
	selections: { conviction: number; option: { id: string } }[]
}) {
	return {
		conviction: call.conviction,
		selections: call.selections.map((s) => ({
			optionId: s.option.id,
			conviction: s.conviction,
		})),
	}
}

type CalledPicks = Parameters<typeof toPicks>[0]

// What each side's call on a question stands to count for in the 1v1.
export function entryPoints({
	question,
	viewerCall,
	creatorCall,
	draft,
	alreadyCalled,
}: {
	question: ChallengePointsQuestion
	viewerCall: CalledPicks | null
	creatorCall: CalledPicks | null
	draft: CallDraft | undefined
	alreadyCalled: boolean
}): {
	yours: ChallengePointsRange | null
	creator: ChallengePointsRange | null
} {
	const yours = alreadyCalled
		? viewerCall && challengePointsRange(question, toPicks(viewerCall), false)
		: draft
			? challengePointsRange(question, draft, true)
			: null
	const creator =
		creatorCall && challengePointsRange(question, toPicks(creatorCall), false)
	return { yours, creator }
}

export type Totals = { best: number; worst: number }

// Everything hitting, and everything missing. A question not called adds
// nothing either way, the same as it scores.
export function totalsOf(ranges: (ChallengePointsRange | null)[]): Totals {
	return ranges.reduce<Totals>(
		(t, r) => (r ? { best: t.best + r.winHigh, worst: t.worst - r.lose } : t),
		{ best: 0, worst: 0 },
	)
}

type Entry = ChallengeEntry_EntryFragment
type Row = ChallengeMatchupRows_MatchupFragment["rows"][number]
type Call = NonNullable<Entry["creatorCall"]>

// What a call still stands to win or lose, while its question hasn't
// settled.
export function openCallRange(
	entry: Entry,
	call: Call | null,
): ChallengePointsRange | null {
	const status = entry.question.status
	if (
		!call ||
		status === "VOIDED" ||
		status === "RESOLVED" ||
		status === "DISPUTED"
	) {
		return null
	}
	return challengePointsRange(
		unmask(CastCallFormFragment, entry.question),
		toPicks(call),
		false,
	)
}

// Each side's total still riding on the questions that haven't settled. A
// question with no 1v1 row yet counts the creator's call on its own.
export function openPointsBySide(
	entries: Entry[],
	rows: Row[],
): {
	creator: ChallengePointsRange | null
	acceptor: ChallengePointsRange | null
} {
	const rowFor = (entry: Entry) =>
		rows.find((r) => r.question.id === entry.question.id) ?? null
	return {
		creator: sumPointsRanges(
			entries.map((e) =>
				openCallRange(e, rowFor(e)?.creatorCall ?? e.creatorCall),
			),
		),
		acceptor: sumPointsRanges(
			entries.map((e) => openCallRange(e, rowFor(e)?.acceptorCall ?? null)),
		),
	}
}
