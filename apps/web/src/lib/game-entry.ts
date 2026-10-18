import {
	type ChipLabelQuestion,
	gameQuestionChipLabels,
} from "./game-question-chip-label"
import { officialQuestionSequence } from "./official-game-questions"
import { questionDetailState } from "./question-detail-state"

// Where one user's picks on a game's official questions live. The game id and
// the username are the whole address, same as a ballot entry.
export function gameEntryPath(gameId: string, username: string): string {
	return `/games/${gameId}/picks/${username}`
}

type EntryQuestion = Parameters<typeof officialQuestionSequence>[0][number] &
	ChipLabelQuestion &
	Parameters<typeof questionDetailState>[0]

export type GameEntryRow<Q, C> = {
	section: string
	question: Q
	call: C | null
	code: string
}

// Same order and sections as the game page and its rail. Only called
// questions get a row; the rest are summed up underneath, split by whether
// they can still be called, so picks shared early aren't a long run of
// empty rows.
export function gameEntryRows<Q extends EntryQuestion, C>(
	members: { question: Q; call: C | null }[],
	now: number = Date.now(),
) {
	const callByQuestionId = new Map(members.map((m) => [m.question.id, m.call]))
	const sequence = officialQuestionSequence(members.map((m) => m.question))
	const chipLabels = gameQuestionChipLabels(sequence.map((e) => e.question))
	const rows: GameEntryRow<Q, C>[] = sequence.map(
		({ section, question }, index) => ({
			section,
			question,
			call: callByQuestionId.get(question.id) ?? null,
			code: chipLabels[index] ?? String(index + 1),
		}),
	)
	const canCall = (row: GameEntryRow<Q, C>) =>
		questionDetailState(row.question, now).canCall
	const called = rows.filter((r) => r.call !== null)
	const uncalledLabels = (open: boolean) =>
		rows
			.filter((r) => r.call === null && canCall(r) === open)
			.map((r) => r.code)
	return {
		called,
		notCalledYet: uncalledLabels(true),
		missed: uncalledLabels(false),
		isOpen: rows.some(canCall),
		hasOpenCalls: called.some(canCall),
	}
}
