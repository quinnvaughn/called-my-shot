// The group invite a shared arcade result link carried (?invite=CODE),
// so the "Join this group" step can offer it once the visitor has played.
// Session storage: it belongs to the visit the link opened.
const INVITE_KEY = "cms.arcade.invite"

export function rememberArcadeInvite(code: string) {
	try {
		window.sessionStorage.setItem(INVITE_KEY, code)
	} catch {}
}

export function readArcadeInvite(): string | null {
	try {
		return window.sessionStorage.getItem(INVITE_KEY)
	} catch {
		return null
	}
}
