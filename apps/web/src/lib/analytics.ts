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
	// import.meta.env.PROD is only true in the client bundle `vite build`
	// produces (what the Docker image actually ships) - false under `vite
	// dev`, so running the app locally never sends events into production
	// analytics.
	if (
		initialized ||
		typeof window === "undefined" ||
		!POSTHOG_KEY ||
		!import.meta.env.PROD
	) {
		return
	}
	posthog.init(POSTHOG_KEY, {
		// Same-origin path, proxied to PostHog server-side (see
		// routes/ingest/$.ts) - not PostHog's own domain directly, since
		// that's commonly ad-blocked (EasyPrivacy lists posthog.com).
		api_host: "/ingest",
		person_profiles: "identified_only",
		autocapture: false,
		capture_pageview: false,
		capture_pageleave: false,
		// No feature flags in use - skips the extra remote-config request
		// this would otherwise make on every init.
		advanced_disable_flags: true,
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

export function trackPageview(path: string) {
	if (!initialized) return
	posthog.capture("$pageview", {
		$current_url: `${window.location.origin}${path}`,
	})
}

// Everything the Me query already has that's worth segmenting on in PostHog.
// `name`/`username`/`email` are also what PostHog's person display name falls
// back through, so a person reads as a human instead of a uuid.
type IdentifiedUser = {
	id: string
	name: string
	username: string
	email: string
	isAdmin: boolean
	emailVerified: boolean
	isVerifiedPundit: boolean
	questionCreationEnabled: boolean
	createdAt: string
}

export function identifyUser(user: IdentifiedUser) {
	if (!initialized) return
	posthog.identify(
		user.id,
		{
			name: user.name,
			username: user.username,
			email: user.email,
			isAdmin: user.isAdmin,
			emailVerified: user.emailVerified,
			isVerifiedPundit: user.isVerifiedPundit,
			questionCreationEnabled: user.questionCreationEnabled,
		},
		// Signup date is a fact about the account, not a mutable trait - $set_once
		// keeps it as the value from the first identify, so cohorts built on it
		// stay stable.
		{ signupDate: user.createdAt },
	)
}

export function resetAnalytics() {
	if (!initialized) return
	posthog.reset()
}
