import type { PresserMenuAction } from "#/components/pressers/presser-menu"
import { ReportPresserModal } from "#/components/pressers/report-presser-modal"
import { openModal } from "#/stores/modal-store"
import type { PresserData, QuestionData } from "./types"

export function reportAction(
	label: string,
	presserId: string,
	presserQuestionId: string | null,
	target: "QUESTION" | "ANSWER" | "STATEMENT",
): PresserMenuAction {
	return {
		label,
		danger: true,
		onSelect: () =>
			openModal(
				<ReportPresserModal
					presserId={presserId}
					presserQuestionId={presserQuestionId}
					target={target}
				/>,
			),
	}
}

// What a signed-in viewer can do about a question: report it (or its answer)
// unless it's their own words, and, as the owner, block whoever asked it.
export function questionActions(
	p: PresserData,
	q: QuestionData,
	viewerId: string | null,
	onBlock?: () => void,
): PresserMenuAction[] {
	if (!viewerId) return []
	const actions: PresserMenuAction[] = []
	const askedByViewer = q.asker?.id === viewerId
	if (q.asker && !askedByViewer) {
		actions.push(reportAction("Report question", p.id, q.id, "QUESTION"))
	}
	if (q.isAnswered && !q.noComment && !p.viewerIsOwner) {
		actions.push(reportAction("Report answer", p.id, q.id, "ANSWER"))
	}
	if (onBlock)
		actions.push({ label: "Block asker", danger: true, onSelect: onBlock })
	return actions
}
