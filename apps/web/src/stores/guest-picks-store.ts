import { Store } from "@tanstack/react-store"
import type { QuestionShape } from "#/graphql/generated/graphql"

// A pick a signed-out visitor made in the landing page's hero, held until they
// have an account to post it from. Carries its own title and label so the
// summary and the posted modal can list it without refetching the question.
export type GuestPick = {
	questionId: string
	optionId: string
	shape: QuestionShape
	leagueId: string
	sportId: string
	title: string
	optionLabel: string
	locksAt: string
}

const STORAGE_KEY = "cms.guestPicks.v1"

// Starts empty on the server and through hydration. The browser fills it from
// localStorage once mounted (restoreGuestPicks, readGuestPicks), so a reload or
// a later visit keeps what the visitor already picked.
export const guestPicksStore = new Store<GuestPick[]>([])

function readStorage(): GuestPick[] {
	try {
		const raw = window.localStorage.getItem(STORAGE_KEY)
		const parsed: unknown = raw ? JSON.parse(raw) : []
		return Array.isArray(parsed) ? (parsed as GuestPick[]) : []
	} catch {
		return []
	}
}

function write(picks: GuestPick[]) {
	guestPicksStore.setState(() => picks)
	try {
		if (picks.length === 0) window.localStorage.removeItem(STORAGE_KEY)
		else window.localStorage.setItem(STORAGE_KEY, JSON.stringify(picks))
	} catch {
		// Blocked or full storage: the picks still live in memory for this visit.
	}
}

// Memory is never staler than storage, since every write goes to both. Storage
// only matters when memory is empty because the page just loaded.
function currentPicks(): GuestPick[] {
	return guestPicksStore.state.length > 0 ? guestPicksStore.state : readStorage()
}

// The API refuses a call once its question locks, so there's no point holding
// on to one past that.
function stillOpen(picks: GuestPick[]): GuestPick[] {
	const now = Date.now()
	return picks.filter((pick) => Date.parse(pick.locksAt) > now)
}

// Everything still worth posting. Called once there's an account to post from.
export function readGuestPicks(): GuestPick[] {
	const picks = stillOpen(currentPicks())
	if (picks.length !== guestPicksStore.state.length) write(picks)
	return picks
}

// For the hero stack on mount: keeps only picks for questions it's still
// offering, so a pick that has dropped out (too close to locking) doesn't sit
// in the summary with no card behind it.
export function restoreGuestPicks(offeredIds: ReadonlySet<string>): GuestPick[] {
	const picks = stillOpen(currentPicks()).filter((pick) =>
		offeredIds.has(pick.questionId),
	)
	write(picks)
	return picks
}

// Replaces an earlier pick on the same question in place, so going back and
// changing a pick doesn't reorder the summary.
export function setGuestPick(pick: GuestPick) {
	const current = guestPicksStore.state
	const exists = current.some((p) => p.questionId === pick.questionId)
	write(
		exists
			? current.map((p) => (p.questionId === pick.questionId ? pick : p))
			: [...current, pick],
	)
}

export function removeGuestPick(questionId: string) {
	write(guestPicksStore.state.filter((p) => p.questionId !== questionId))
}

export function clearGuestPicks() {
	write([])
}

const ENTRY_KEY = "cms.guestPicks.entry.v1"

// How the account these picks post from arrived. Signing up is someone's first
// minute in the product, where what a call is and what happens to it still has
// to be said. Signing in is someone who already has a record and knows, so the
// same announcement is in their way.
export type GuestPicksEntry = "signup" | "signin"

export function markGuestPicksEntry(entry: GuestPicksEntry) {
	try {
		window.sessionStorage.setItem(ENTRY_KEY, entry)
	} catch {
		// Blocked storage: the picks still post, they just get the sign-up
		// treatment, which is the safer of the two to show someone twice.
	}
}

// Read once and cleared: it describes one arrival, not the session. Null when
// nothing recorded one, which the caller treats as a sign-up.
export function takeGuestPicksEntry(): GuestPicksEntry | null {
	try {
		const raw = window.sessionStorage.getItem(ENTRY_KEY)
		window.sessionStorage.removeItem(ENTRY_KEY)
		return raw === "signin" || raw === "signup" ? raw : null
	} catch {
		return null
	}
}
