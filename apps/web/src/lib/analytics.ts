import posthog from "posthog-js"
import type { QuestionCallShape } from "#/components/questions/cast-call-form/use-cast-call-form"

// Add new events here as they're needed - `track()` below is typed against
// this map, so every call site gets the right property shape for free and a
// typo'd event name is a compile error instead of a silent no-op in PostHog.
type AnalyticsEvents = {
	user_signed_up: { method: "email" }
	user_signed_in: { method: "email" }
	user_signed_out: Record<string, never>
	email_confirmed: Record<string, never>
	account_deleted: Record<string, never>

	call_submitted: {
		questionId: string
		questionShape: QuestionCallShape
		pickCount: number
		hasCase: boolean
		avgConviction: number
	}

	question_created: {
		questionId: string
		shape: QuestionCallShape
		sportId: string
		leagueId: string
		isOfficial: boolean
	}
	question_resolved: { questionId: string; shape: QuestionCallShape }
	question_disputed: { questionId: string; reason: string }
	question_reported: { questionId: string; reason: string }

	group_created: { groupId: string }
	group_joined: { groupId: string; source: "invite_link" | "code_form" }
	group_invite_copied: { groupId: string }

	share_image_copied: { type: "profile" | "call_result" | "league" }
	share_image_saved: { type: "profile" | "call_result" | "league" }

	support_ticket_filed: { category: string }
}

const POSTHOG_KEY = import.meta.env.VITE_PUBLIC_POSTHOG_KEY as
	| string
	| undefined

let initialized = false

export function initAnalytics() {
	if (initialized || typeof window === "undefined" || !POSTHOG_KEY) return
	posthog.init(POSTHOG_KEY, {
		api_host:
			(import.meta.env.VITE_PUBLIC_POSTHOG_HOST as string | undefined) ??
			"https://us.i.posthog.com",
		person_profiles: "identified_only",
		autocapture: false,
		capture_pageview: false,
		capture_pageleave: false,
	})
	initialized = true
}

export function track<E extends keyof AnalyticsEvents>(
	...args: AnalyticsEvents[E] extends never
		? [event: E]
		: [event: E, properties: AnalyticsEvents[E]]
) {
	if (!initialized) return
	const [event, properties] = args
	posthog.capture(event as string, properties)
}

export function identifyUser(user: { id: string; email?: string | null }) {
	if (!initialized) return
	posthog.identify(user.id, user.email ? { email: user.email } : undefined)
}

export function resetAnalytics() {
	if (!initialized) return
	posthog.reset()
}
