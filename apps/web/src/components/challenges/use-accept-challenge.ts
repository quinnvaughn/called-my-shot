import { useQueryClient } from "@tanstack/react-query"
import { useRouter } from "@tanstack/react-router"
import { useEffect, useState } from "react"
import type { CallDraft } from "#/components/questions/cast-call-form"
import { gqlFetch } from "#/graphql/fetcher"
import { AcceptChallengeDocument } from "#/graphql/mutations/challenges"
import { track } from "#/lib/analytics"
import {
	clearChallengeDrafts,
	readChallengeDrafts,
	saveChallengeDrafts,
} from "#/stores/challenge-drafts-store"

// One send per challenge at a time, across remounts: signing in can remount
// the page while the send it started is still running, and the page then
// tries to send again on its own.
const inFlight = new Map<string, Promise<string | null>>()

async function sendAccept(
	code: string,
	drafts: Record<string, CallDraft>,
): Promise<string | null> {
	const data = await gqlFetch(AcceptChallengeDocument, {
		input: {
			code,
			calls: Object.entries(drafts).map(([questionId, draft]) => ({
				questionId,
				caseText: draft.caseText || undefined,
				guessValue: draft.guessValue ?? undefined,
				conviction: draft.conviction ?? undefined,
				selections: draft.selections,
			})),
		},
	})
	const result = data.acceptChallenge
	if (result.__typename === "ChallengePayload") return null
	if (result.__typename === "ValidationError") {
		return result.fieldErrors?.[0]?.message ?? result.message
	}
	return result.message
}

// The calls someone is making to take a challenge on, kept in storage until
// they send them all together. Only the questions they still have to call
// count: a draft for one they've since called some other way is dropped.
export function useAcceptChallenge({
	challengeId,
	code,
	missingQuestionIds,
	questionCount,
	onAccepted,
}: {
	challengeId: string
	code: string
	missingQuestionIds: string[]
	questionCount: number
	onAccepted: () => void
}) {
	const queryClient = useQueryClient()
	const router = useRouter()
	const [drafts, setDrafts] = useState<Record<string, CallDraft>>({})
	const [loaded, setLoaded] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [sending, setSending] = useState(false)

	const needed = (all: Record<string, CallDraft>) =>
		Object.fromEntries(
			Object.entries(all).filter(([id]) => missingQuestionIds.includes(id)),
		)

	// Storage is only readable once mounted.
	// biome-ignore lint/correctness/useExhaustiveDependencies: read once per challenge
	useEffect(() => {
		setDrafts(needed(readChallengeDrafts(code)))
		setLoaded(true)
	}, [code])

	function saveDraft(questionId: string, draft: CallDraft) {
		setDrafts((current) => {
			const next = { ...current, [questionId]: draft }
			saveChallengeDrafts(code, next)
			return next
		})
	}

	const complete = missingQuestionIds.every((id) => drafts[id] !== undefined)

	async function send() {
		const toSend = needed(drafts)
		setError(null)
		setSending(true)
		const pending =
			inFlight.get(code) ??
			sendAccept(code, toSend).finally(() => inFlight.delete(code))
		inFlight.set(code, pending)
		try {
			const failure = await pending
			if (failure) {
				setError(failure)
				return
			}
			clearChallengeDrafts(code)
			track("challenge_accepted", {
				challengeId,
				questionCount,
				newCalls: Object.keys(toSend).length,
			})
			await queryClient.invalidateQueries()
			await router.invalidate()
			onAccepted()
		} catch {
			setError("Something went wrong. Try again.")
		} finally {
			setSending(false)
		}
	}

	return { drafts, loaded, saveDraft, complete, send, sending, error }
}
