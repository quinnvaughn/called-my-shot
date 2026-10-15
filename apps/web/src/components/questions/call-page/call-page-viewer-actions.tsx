import { match } from "ts-pattern"
import { CallSignupCta } from "#/components/questions/call-signup-cta"
import type { CallRecord, CallView } from "#/lib/call-view"
import { buildQuestionSlug } from "#/lib/slug"

type Props = {
	call: CallRecord
	view: CallView
	signedIn: boolean
}

// What the page asks of a signed-out reader: sign up and make a call of their
// own.
export function CallPageViewerActions({ call, view, signedIn }: Props) {
	if (signedIn) return null
	return (
		<CallSignupCta
			state={match(view)
				.with({ questionStatus: "OPEN" }, () => ({ kind: "open" }) as const)
				.with({ isWin: true }, () => ({ kind: "hit" }) as const)
				.with({ isWin: false }, () => ({ kind: "miss" }) as const)
				.otherwise(() => ({ kind: "closed" }) as const)}
			username={view.username}
			questionId={call.question.id}
			slug={buildQuestionSlug(call.question.title)}
			leagueSlug={call.question.league.slug}
		/>
	)
}
