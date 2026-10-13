import { isSeasonLongShape } from "@called-my-shot/scoring"
import posthog from "posthog-js"
import type { AuthModalSurface } from "#/components/auth/auth-modal"
import type { GuestPicksAuthSource } from "#/components/landing-page/guest-picks/open-guest-picks-auth"
import type { QuestionCallShape } from "#/components/questions/cast-call-form/use-cast-call-form"
import type { PresserAskStatus } from "#/graphql/generated/graphql"
import type { ShareLanding } from "#/lib/share-links"
import type { ViewerStatus } from "#/lib/viewer-status"

// Whether a question settles off one game or off the season. Separates someone
// holding award calls that land in June from someone with games tonight.
export type QuestionHorizon = "game" | "season"
export function questionHorizon(shape: QuestionCallShape): QuestionHorizon {
	return isSeasonLongShape(shape) ? "season" : "game"
}

// Where a call was made from. The question page is where most calls land;
// the call page is a fade aimed at someone's receipt; guest_picks are the
// landing page's picks, posted once the visitor has an account.
export type CallSurface =
	| "question_page"
	| "call_page"
	| "guest_picks"
	| "challenge"

// Add new events here as they're needed - `track()` below is typed against
// this map, so every call site gets the right property shape for free and a
// typo'd event name is a compile error instead of a silent no-op in PostHog.
type AnalyticsEvents = {
	// `surface` separates the landing page's "lock these in" prompt from every
	// other way into the auth modal, so it's visible whether trying picks first
	// actually moves signups.
	// referralSource is null for the front door. Carried here as well as on
	// the server's referral_signup so a referred cohort can be split out in
	// any funnel that starts at signup, without a join back to the API's
	// events.
	user_signed_up: {
		method: "email" | "google"
		surface: AuthModalSurface
		referralSource: "invite_link" | "manual_code" | null
	}
	user_signed_in: { method: "email" | "google"; surface: AuthModalSurface }
	user_signed_out: Record<string, never>
	email_confirmed: Record<string, never>
	password_reset_requested: Record<string, never>
	password_reset_completed: Record<string, never>
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
		surface: CallSurface
	}
	// A tap on the step a new call points at, toward the next question on the
	// game. aboutPickedTeam is whether the step was the one following from
	// the viewer's winner pick.
	next_up_tapped: {
		fromQuestionId: string
		toQuestionId: string
		aboutPickedTeam: boolean
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
	// memberCount is the size before the leave or delete, so a two-person
	// group falling apart reads differently from a big one losing someone.
	group_left: { groupId: string; memberCount: number }
	group_deleted: { groupId: string; memberCount: number }

	// emailMuted is whether the reminder can only arrive in-app, which is
	// when the toast points at email settings.
	game_reminder_set: { gameId: string; emailMuted: boolean }
	game_reminder_removed: { gameId: string }

	// A profile's own url being handed to someone. `x` fires on click, since
	// an intent link's outcome is as unknowable as `native`'s.
	profile_link_shared: {
		userId: string
		method: "native" | "clipboard" | "x"
	}

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
	// your own straight off the ballot you're filling in (its page, or the
	// rail beside one of its questions) from sharing from the entry page
	// itself, which anyone can do for anyone's.
	ballot_link_shared: {
		ballotId: string
		method: "native" | "clipboard" | "x"
		surface: "ballot_page" | "question_rail" | "entry_page"
	}
	// A link to one person's picks on a game's official questions: shared
	// from the game page, from the game strip on a question page, or from the
	// picks page itself, which anyone can do for anyone's.
	game_picks_shared: {
		gameId: string
		method: "native" | "clipboard" | "x"
		surface: "game_page" | "question_strip" | "entry_page"
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
	report_card_link_shared: {
		userId: string
		league: string
		windowKey: string
		method: "native" | "clipboard" | "x"
	}
	// A group's weekly recap, from the group's page or the recap's own.
	recap_link_shared: {
		recapId: string
		method: "native" | "clipboard" | "x"
	}
	// A challenge's link, or one 1v1's receipt.
	challenge_link_shared: {
		challengeId: string
		receipt: boolean
		method: "native" | "clipboard" | "x"
	}

	// source says where the builder was opened from.
	challenge_created: {
		challengeId: string
		questionCount: number
		groupCount: number
		source:
			| "question"
			| "call"
			| "game"
			| "game_picks"
			| "new_question"
			| "builder"
	}
	// newCalls is how many questions they called as part of accepting, as
	// against ones they'd already called.
	challenge_accepted: {
		challengeId: string
		questionCount: number
		newCalls: number
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
	// `index` is which card of the game the pick was made on: 0 is who wins,
	// then each team's total.
	guest_pick_made: {
		questionId: string
		questionShape: QuestionCallShape
		leagueId: string
		index: number
	}
	// Carries the same league and shape a made pick does, so a skip rate can be
	// read per league and per shape. Which one the skips cluster on is the whole
	// question: a league means the stack offered a sport the visitor doesn't
	// follow, a shape means the question itself was the problem.
	guest_pick_skipped: {
		questionId: string
		questionShape: QuestionCallShape
		leagueId: string
	}
	// The hero's league chips. Without it there's no telling a visitor who found
	// their sport apart from one who never noticed the row.
	guest_picks_league_selected: { leagueId: string }
	guest_picks_signup_opened: {
		pickCount: number
		source: GuestPicksAuthSource
	}
	// Fired once the account exists and the held picks have been sent.
	// `notPosted` counts refusals (the game locked, or already called) and
	// failed requests together.
	guest_picks_submitted: { posted: number; notPosted: number }

	// The invite loop's front half. The back half - a code converting to an
	// account and then to a first call - is server-side in apps/api
	// lib/analytics-outbox.ts, since neither moment is something the browser
	// sees reliably.
	//
	// Worth being clear about what these can and can't say: a share is not an
	// invite. One copied link can go to one person or to a group chat of
	// fifty, and for `native` the OS sheet takes over so the destination is
	// unknowable, the same limit question_link_shared already has. So the
	// countable denominator for k-factor is join_page_viewed - one unique
	// visitor there is one person who actually received an invite - and
	// referral_link_shared only says how the links leave.
	referral_link_shared: {
		method: "native" | "clipboard" | "x"
		surface: "invite_page" | "out_of_redos"
	}
	// Someone landed on /join/:code. `codeValid` separates a live link from a
	// typo or a rotated code, which otherwise look identical in the funnel.
	// The gap between this and referral_signup is the attribution the link
	// loses - mostly people who open it on a phone and sign up on a laptop,
	// which is exactly what the manual code field exists to win back.
	join_page_viewed: { codeValid: boolean }
	// The "have a code?" field being used. Fires on submit, not on focus, and
	// prefilled is whether /join had already filled it in - an unprefilled one
	// is someone typing a code a friend read out to them, which is the case
	// the link alone can't serve.
	referral_code_entered: { prefilled: boolean }

	// A redo being started from the UI. The spend itself is server-side
	// (redo_spent), which is where the wallet and timing facts are; this is
	// only the intent, so an abandoned redo form is visible.
	redo_started: {
		questionId: string
		questionShape: QuestionCallShape
		balance: number
	}
	// The out-of-redos modal opening, which only happens from "Use a redo" at a
	// balance of 0. Wanting a redo and not having one is the moment someone is
	// most likely to actually send an invite, so this paired with
	// referral_link_shared from surface out_of_redos is the loop's tightest
	// measure.
	out_of_redos_shown: { questionId: string }
	// The earn link on a redo row. Carries the balance because the link shows
	// at every balance, so a click at 0 (someone blocked, converting) and a
	// click at 3 (someone topping up) are different acts and would otherwise
	// be indistinguishable.
	redo_invite_clicked: { questionId: string; balance: number }

	// The post-game presser's section rendering on a picks page, once per
	// presser per visit. viaGroup is a visit that came from a group's page or
	// board (the ?group= the breadcrumb reads). askStatus is what the viewer
	// was offered, so "saw it, couldn't ask" is separable from "saw it, chose
	// not to". Joins the server's presser_* events on presserId.
	presser_viewed: {
		presserId: string
		isOwner: boolean
		askStatus: PresserAskStatus
		viaGroup: boolean
	}
	// A card in the group page's "From the pressers" strip. The strip's whole
	// job is bringing people back to the group after games, so this against
	// group page views is its measure.
	group_presser_strip_clicked: {
		groupId: string
		presserId: string
		ownerIsViewer: boolean
	}
	// "Read the full presser" under a call's record card.
	presser_excerpt_clicked: { presserId: string; callId: string }
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

// `share` is set when the visit arrived on a shared link (lib/share-links.ts).
// It rides on the pageview as this landing's share, and is registered once
// per browser as the first share, so a later user_signed_up can be traced
// back to the share and the sharer that brought the visitor in. A sharer
// opening their own link is not a share landing.
export function trackPageview(path: string, share: ShareLanding | null) {
	if (!initialized) return
	const landing =
		share && share.sharerId !== posthog.get_distinct_id() ? share : null
	if (landing) {
		posthog.register_once({
			firstShareCampaign: landing.campaign,
			firstShareMethod: landing.method,
			firstShareRef: landing.sharerId,
		})
	}
	posthog.capture("$pageview", {
		$current_url: `${window.location.origin}${path}`,
		...(landing && {
			shareCampaign: landing.campaign,
			shareMethod: landing.method,
			shareRef: landing.sharerId,
		}),
	})
}

// Everything the Me query already has that's worth segmenting on in PostHog.
// `name`/`username`/`email` are also what PostHog's person display name falls
// back through, so a person reads as a human instead of a uuid.
type IdentifiedUser = {
	id: string
	name: string
	username: string
	email: string | null
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
