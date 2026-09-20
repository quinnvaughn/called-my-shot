import type { QueryClient } from "@tanstack/react-query"
import type { AnyRouter } from "@tanstack/react-router"
import { createElement } from "react"
import { GuestPicksPostedModal } from "#/components/onboarding/guest-picks-posted-modal"
import type { QuestionCallShape } from "#/components/questions/cast-call-form/use-cast-call-form"
import { gqlFetch } from "#/graphql/fetcher"
import { CastCallDocument } from "#/graphql/mutations/calls"
import { questionHorizon, track } from "#/lib/analytics"
import { pluralize } from "#/lib/pluralize"
import {
	clearGuestPicks,
	type GuestPick,
	readGuestPicks,
	takeGuestPicksEntry,
} from "#/stores/guest-picks-store"
import { openModal } from "#/stores/modal-store"
import { showToast } from "#/stores/toast-store"

// Guest picks never show a conviction slider, so they go in at the midpoint the
// call form's own slider starts on.
const GUEST_PICK_CONVICTION = 50

let inFlight: Promise<void> | null = null

// Posts whatever a visitor picked on the landing page before they had an
// account, then tells them how many made it. Home runs this on mount, and every
// sign-up and sign-in lands there, so it's one path no matter which button got
// them in. The shared promise keeps a second mount (React's dev double effect)
// from posting the same picks twice.
export function submitGuestPicks(deps: {
	queryClient: QueryClient
	router: AnyRouter
}): Promise<void> {
	if (inFlight) return inFlight
	const picks = readGuestPicks()
	if (picks.length === 0) return Promise.resolve()
	inFlight = postPicks(picks, deps).finally(() => {
		inFlight = null
	})
	return inFlight
}

async function postPicks(
	picks: GuestPick[],
	{ queryClient, router }: { queryClient: QueryClient; router: AnyRouter },
) {
	const posted: GuestPick[] = []
	for (const pick of picks) {
		try {
			const data = await gqlFetch(CastCallDocument, {
				input: {
					questionId: pick.questionId,
					selections: [
						{ optionId: pick.optionId, conviction: GUEST_PICK_CONVICTION },
					],
				},
			})
			if (data.castCall?.__typename !== "CastCallPayload") continue
			posted.push(pick)
			const questionShape = pick.shape.toLowerCase() as QuestionCallShape
			track("call_submitted", {
				questionId: pick.questionId,
				questionShape,
				leagueId: pick.leagueId,
				sportId: pick.sportId,
				horizon: questionHorizon(questionShape),
				locksAt: pick.locksAt,
				pickCount: 1,
				hasCase: false,
				avgConviction: GUEST_PICK_CONVICTION,
			})
		} catch {
			// A network or server failure counts the same as a refusal: the pick
			// didn't post, and the modal says so.
		}
	}

	const notPostedCount = picks.length - posted.length
	clearGuestPicks()
	track("guest_picks_submitted", {
		posted: posted.length,
		notPosted: notPostedCount,
	})
	await queryClient.invalidateQueries()
	await router.invalidate()

	// Someone signing in already has a record and knows what a call is, so the
	// modal would be explaining the product to them with an OK button in the
	// way of the page they came for. What they still need is whether the picks
	// landed, which a toast answers without being dismissed.
	if (takeGuestPicksEntry() === "signin") {
		showToast({
			message: postedMessage(posted.length, notPostedCount),
			action:
				posted.length > 0
					? { label: "See my calls", to: "/my-calls" }
					: undefined,
		})
		return
	}

	openModal(createElement(GuestPicksPostedModal, { posted, notPostedCount }))
}

// The same three cases the posted modal covers, in one line each.
function postedMessage(postedCount: number, notPostedCount: number): string {
	if (postedCount === 0) {
		return "Those picks didn't post. Their games locked first, or you'd already called them."
	}
	const posted = `${postedCount} ${pluralize(postedCount, "call")} on your record.`
	if (notPostedCount === 0) return posted
	return notPostedCount === 1
		? `${posted} 1 pick didn't post: its game locked first, or you'd already called it.`
		: `${posted} ${notPostedCount} picks didn't post: their games locked first, or you'd already called them.`
}
