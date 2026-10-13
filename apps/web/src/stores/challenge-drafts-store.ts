import type { CallDraft } from "#/components/questions/cast-call-form"

// The calls someone has made toward accepting a challenge, held until they
// send them all at once. Kept in storage so a signed-out visitor's calls
// survive signing up, including a Google sign-in, which leaves the page and
// comes back to it.
type Drafts = Record<string, Record<string, CallDraft>>

const STORAGE_KEY = "cms.challengeDrafts.v1"

function read(): Drafts {
	try {
		const raw = window.localStorage.getItem(STORAGE_KEY)
		const parsed: unknown = raw ? JSON.parse(raw) : {}
		return parsed && typeof parsed === "object" ? (parsed as Drafts) : {}
	} catch {
		return {}
	}
}

function write(drafts: Drafts) {
	try {
		if (Object.keys(drafts).length === 0) {
			window.localStorage.removeItem(STORAGE_KEY)
		} else {
			window.localStorage.setItem(STORAGE_KEY, JSON.stringify(drafts))
		}
	} catch {
		// Blocked or full storage: the drafts still live in the page's state.
	}
}

export function readChallengeDrafts(code: string): Record<string, CallDraft> {
	return read()[code] ?? {}
}

export function saveChallengeDrafts(
	code: string,
	drafts: Record<string, CallDraft>,
) {
	const all = read()
	if (Object.keys(drafts).length === 0) delete all[code]
	else all[code] = drafts
	write(all)
}

export function clearChallengeDrafts(code: string) {
	saveChallengeDrafts(code, {})
}
