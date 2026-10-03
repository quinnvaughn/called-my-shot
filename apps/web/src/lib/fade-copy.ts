import {
	GLOAT_OPTIONS,
	GLOAT_TEXT,
	type GloatMessage,
} from "@called-my-shot/schemas"

// Every sentence a fade produces, in one place so the call page and the
// notifications word the same outcome the same way.

// A gloat line as the api sends it (the GraphQL enum's SCREAMING_SNAKE name)
// and as it reads.
export function gloatText(message: string): string {
	return GLOAT_TEXT[message.toLowerCase() as GloatMessage] ?? ""
}

// The lines one side of a fade can pick from, keyed the way the api takes them.
export function gloatChoices(side: "target" | "fader") {
	return GLOAT_OPTIONS[side].map((message) => ({
		value: message.toUpperCase(),
		text: GLOAT_TEXT[message],
	}))
}

// How a call's doubters did, once there's a result. Counts only the fades that
// have a winner: a doubter the target flipped onto the same side neither won
// nor lost. Null while nothing has settled.
export function doubtersVerdict(cashed: number, wrong: number): string | null {
	const settled = cashed + wrong
	if (settled === 0) return null
	if (cashed === 0) {
		return settled === 1
			? "The doubter was wrong"
			: `All ${settled} doubters were wrong`
	}
	if (wrong === 0) {
		return settled === 1
			? "The doubter called it"
			: `All ${settled} doubters called it`
	}
	return `${cashed} of ${settled} doubters called it`
}

export type ResolvedFade = {
	fadedUsername: string | null
	fadeLanded: boolean | null
	targetFlipped: boolean
	doubtersCashed: number
	doubtersWrong: number
	gloatOpen: boolean
}

// The extra line on a resolved-call notification, from the recipient's side:
// how their own fade went, then how their doubters did, then a nudge to gloat
// while the call page still offers one. Null when none has anything to say.
export function resolvedFadeLine(fade: ResolvedFade): string | null {
	const parts: string[] = []

	if (fade.fadedUsername) {
		if (fade.targetFlipped) {
			parts.push(`@${fade.fadedUsername} flipped onto your side.`)
		} else if (fade.fadeLanded === true) {
			parts.push(`Your fade on @${fade.fadedUsername} hit.`)
		} else if (fade.fadeLanded === false) {
			parts.push(`Your fade on @${fade.fadedUsername} missed.`)
		}
	}

	const settled = fade.doubtersCashed + fade.doubtersWrong
	if (settled > 0) {
		if (fade.doubtersCashed === 0) {
			parts.push(
				settled === 1
					? "Your doubter was wrong."
					: `${settled} doubters, all wrong.`,
			)
		} else if (fade.doubtersWrong === 0) {
			parts.push(
				settled === 1
					? "Your doubter called it."
					: `All ${settled} doubters called it.`,
			)
		} else {
			parts.push(`${fade.doubtersCashed} of ${settled} doubters called it.`)
		}
	}

	if (fade.gloatOpen) parts.push("Send them a line.")

	return parts.length > 0 ? parts.join(" ") : null
}
