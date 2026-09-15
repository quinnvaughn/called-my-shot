import { isSeasonLongShape } from "@called-my-shot/scoring"
import posthog from "posthog-js"
import type { AuthModalSurface } from "#/components/auth/auth-modal"
import type { QuestionCallShape } from "#/components/questions/cast-call-form/use-cast-call-form"
import type { ViewerStatus } from "#/lib/viewer-status"

// Whether a question settles off one game or off the season. Separates someone
// holding award calls that land in June from someone with games tonight.
export type QuestionHorizon = "game" | "season"
export function questionHorizon(shape: QuestionCallShape): QuestionHorizon {
	return isSeasonLongShape(shape) ? "season" : "game"
}

// Add new events here as they're needed - `track()` below is typed against
// this map, so every call site gets the right property shape for free and a
// typo'd event name is a compile error instead of a silent no-op in PostHog.
type AnalyticsEvents = {
	// `surface` separates the landing page's "lock these in" prompt from every
	// other way into the auth modal, so it's visible whether trying picks first
	// actually moves signups.
	user_signed_up: { method: "email"; surface: AuthModalSurface }
	user_signed_in: { method: "email"; surface: AuthModalSurface }
	user_signed_out: Record<string, never>
	email_confirmed: Record<string, never>
	account_deleted: Record<string, never>

	// locksAt with horizon is the time-to-resolution signal: a game question
	// settles within hours of locking, a season one months after. The call
	// settling is call_resolved, captured server-side (apps/api
	// lib/analytics-outbox.ts) since nothing in the browser sees it happen.
	call_submitted: {
		questionId: string
		questionShape: QuestionCallShape
		leagueId: string
		sportId: string
		horizon: QuestionHorizon
		locksAt: string
		pickCount: number
		hasCase: boolean
		avgConviction: number
	}
	// One per mount of a question's page. viewerState is what the page offered:
	// only a `canCall` view could have become a call, so viewed-to-called is
	// measured over those, and the rest tell "nothing left to call" apart
	// from "chose not to".
	question_viewed: {
		questionId: string
		questionShape: QuestionCallShape
		leagueId: string
		sportId: string
		horizon: QuestionHorizon
		viewerState: ViewerStatus<unknown>["kind"]
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
	// `surface` separates the header's Invite modal from the inline card small
	// groups show, so it's visible which one actually gets links sent.
	group_invite_shared: {
		groupId: string
		method: "native" | "clipboard"
		surface: "invite_modal" | "group_card"
	}
	// memberCount separates someone opting out of a two-person group from
	// someone hiding the card on a group that has already grown.
	group_invite_card_dismissed: { groupId: string; memberCount: number }

	// Profile track-record cards only. A call used to have a downloadable
	// image too; what gets shared now is a link to the call's own page, which
	// is call_link_shared below.
	share_image_copied: { type: "profile" | "league" }
	share_image_saved: { type: "profile" | "league" }

	// The share sheet itself opening is worth its own event - an open with no
	// link/group event after it is an abandoned share, which is invisible if
	// only the completions are tracked.
	share_sheet_opened: { questionId: string; surface: "question_detail" }
	// `native` means the OS share sheet took over (navigator.share) - the
	// destination is unknowable from there, unlike `clipboard`.
	question_link_shared: {
		questionId: string
		method: "native" | "clipboard"
	}
	question_shared_to_group: { questionId: string; groupId: string }
	// The call's own page being handed to someone. `surface` separates a share
	// from the call page itself (someone already looking at the record) from
	// one off the resolution card (someone who just found out how they did) -
	// they're different moments and worth telling apart. `x` fires on click,
	// since an intent link's outcome is as unknowable as `native`'s.
	call_link_shared: {
		callId: string
		method: "native" | "clipboard" | "x"
		surface: "call_page" | "question_detail"
	}
	// A link to one person's filled-out ballot. `surface` separates sharing
	// your own straight off the ballot you're filling in from sharing from the
	// entry page itself, which anyone can do for anyone's.
	ballot_link_shared: {
		ballotId: string
		method: "native" | "clipboard" | "x"
		surface: "ballot_page" | "entry_page"
	}
	// A link to one person's league-and-family streak page, or to a slate
	// they swept. Each has one page it can be shared from, so no surface.
	streak_link_shared: {
		userId: string
		league: string
		family: string
		method: "native" | "clipboard" | "x"
	}
	sweep_link_shared: {
		userId: string
		league: string
		slateKey: string
		method: "native" | "clipboard" | "x"
	}

	support_ticket_filed: { category: string }

	// The onboarding walkthrough. `surface` separates the two places a user can
	// enter it, since the intro modal and the checklist are independently
	// skippable and it matters which one people actually act on.
	onboarding_started: { surface: "launcher" | "checklist" | "first_call_tour" }
	onboarding_step_completed: { step: string }
	// stepsComplete is what makes a dismissal readable: bailing out at 0 of 2
	// is a different signal from tidying away a list that's already done.
	onboarding_dismissed: {
		at: "launcher" | "checklist"
		stepsComplete: number
	}
	onboarding_completed: Record<string, never>
	first_call_tour_step: { step: number }

	// The landing page's try-it stack, before the visitor has an account.
	// `index` is which card in the stack the pick was made on.
	guest_pick_made: {
		questionId: string
		questionShape: QuestionCallShape
		index: number
	}
	guest_pick_skipped: { questionId: string }
	guest_picks_signup_opened: { pickCount: number }
	// Fired once the account exists and the held picks have been sent.
	// `notPosted` counts refusals (the game locked, or already called) and
	// failed requests together.
	guest_picks_submitted: { posted: number; notPosted: number }
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
