import { match } from "ts-pattern"
import { CallSignupCta } from "#/components/questions/call-signup-cta"
import { FadeCta } from "#/components/questions/fade-cta"
import { GloatCta } from "#/components/questions/gloat-cta"
import type { CallRecord, CallView } from "#/lib/call-view"
import { isRateStat } from "#/lib/field-signal"
import {
	isOverUnderQuestionShape,
	optionDisplayLabel,
} from "#/lib/question-labels"
import { buildQuestionSlug } from "#/lib/slug"

type Props = {
	call: CallRecord
	view: CallView
	signedIn: boolean
}

// What the page asks of whoever is reading it: sign up, fade the call, or
// send the gloat a settled fade earned.
export function CallPageViewerActions({ call, view, signedIn }: Props) {
	return (
		<>
			{!signedIn && (
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
			)}

			{/* A signed-in viewer's counterpart to the signup CTA above, in the
			same spot: on someone else's open call, fading it is the one thing
			the page asks them to do. Signed out, the signup CTA already offers
			a call on this question, so this would be a second competing box. */}
			{signedIn && call.fadeOffer && (
				<FadeCta
					callId={call.id}
					questionId={call.question.id}
					opUsername={view.username}
					opPickLabel={view.pickLabel}
					pickLabel={optionDisplayLabel(
						call.fadeOffer.option.label,
						isOverUnderQuestionShape(call.question.shape),
						call.question.ouLine,
						isRateStat(call.question),
					)}
					optionId={call.fadeOffer.option.id}
					mode={call.fadeOffer.mode}
				/>
			)}

			{/* Once a fade settles, the winning side's one gloat, in the same
			spot the fade offer held while the question was open. */}
			{call.viewerGloat &&
				(call.viewerGloat.audience === "DOUBTERS" ? (
					<GloatCta
						audience={{
							kind: "doubters",
							callId: call.id,
							count: call.viewerGloat.count,
						}}
					/>
				) : (
					call.viewerGloat.fadeId && (
						<GloatCta
							audience={{
								kind: "target",
								fadeId: call.viewerGloat.fadeId,
								username: call.viewerGloat.targetUsername ?? view.username,
							}}
						/>
					)
				))}
		</>
	)
}
