// The action a signed-out visitor asked for before being sent to sign up,
// held across the full-page round trip through Google. An email signup never
// needs it: the modal stays open and runs the action itself (see
// useRequireAuth). Session storage because the trip is one tab's navigation,
// and an intent left behind in another tab shouldn't fire there.
export type AuthIntent =
	| { kind: "create_group"; name: string }
	| { kind: "join_group"; code: string }
	| { kind: "join_group_recap"; token: string }

const STORAGE_KEY = "cms.authIntent.v1"

// Overwrites whatever was there, and clears it when there's nothing to carry,
// so an earlier abandoned trip can't ride along on a later one.
export function saveAuthIntent(intent: AuthIntent | null) {
	try {
		if (intent) {
			window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(intent))
		} else {
			window.sessionStorage.removeItem(STORAGE_KEY)
		}
	} catch {
		// Blocked storage: the account still gets made, and the visitor does
		// the action again by hand.
	}
}

// Read once and cleared, since it describes one trip.
export function takeAuthIntent(): AuthIntent | null {
	try {
		const raw = window.sessionStorage.getItem(STORAGE_KEY)
		window.sessionStorage.removeItem(STORAGE_KEY)
		return raw ? parseAuthIntent(JSON.parse(raw)) : null
	} catch {
		return null
	}
}

function parseAuthIntent(value: unknown): AuthIntent | null {
	if (typeof value !== "object" || value === null) return null
	const record = value as Record<string, unknown>
	if (record.kind === "create_group" && typeof record.name === "string") {
		return { kind: "create_group", name: record.name }
	}
	if (record.kind === "join_group" && typeof record.code === "string") {
		return { kind: "join_group", code: record.code }
	}
	if (record.kind === "join_group_recap" && typeof record.token === "string") {
		return { kind: "join_group_recap", token: record.token }
	}
	return null
}
