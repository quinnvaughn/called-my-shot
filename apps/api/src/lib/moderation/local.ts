import { ANYWHERE_TERMS, STANDARD_TERMS, STRICT_TERMS } from "./blocklist"
import type { ModerationResult, Strictness } from "./types"

const decode = (terms: string[]) =>
	terms.map((term) => Buffer.from(term, "base64").toString("utf8"))

// Each letter may repeat ("niiice" still reads as "nice"), so a stretched
// spelling matches the same term.
const stretched = (term: string) => [...term].map((ch) => `${ch}+`).join("")

const wordPattern = (terms: string[]) =>
	new RegExp(`\\b(?:${terms.map(stretched).join("|")})(?:e?s|z)?\\b`)

const STANDARD_WORDS = wordPattern(decode(STANDARD_TERMS))
const STRICT_WORDS = wordPattern(decode(STRICT_TERMS))
const ANYWHERE = new RegExp(decode(ANYWHERE_TERMS).map(stretched).join("|"))

const LEET: Record<string, string> = {
	"0": "o",
	"1": "i",
	"3": "e",
	"4": "a",
	"5": "s",
	"7": "t",
	"@": "a",
	$: "s",
	"!": "i",
	"|": "i",
}

function normalize(text: string): string {
	return text
		.normalize("NFKD")
		.replace(/[̀-ͯ]/g, "")
		.toLowerCase()
		.replace(/[013457@$!|]/g, (ch) => LEET[ch] ?? ch)
}

const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/i
// Ten digits in the usual groupings. Stat lines never run that long.
const PHONE = /(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/
// A house number and a street. Limited to suffixes that don't double as
// sports words ("drive", "court", "lane" all do).
const STREET =
	/\b\d{1,5}\s+(?:[a-z0-9.']+\s+){1,3}(?:street|avenue|ave|road|rd|boulevard|blvd)\b/i

const THREATS = [
	// First person only: "they'll kill you on the boards" is basketball.
	/\b(?:i(?:'?ll| will| am going to|'?m going to|'?m gonna| gonna)|imma|ima)\s+(?:kill|murder|shoot|stab|hurt|find)\s+(?:you|u|ya)\b/,
	/\bknow where (?:you|u) live\b/,
	/\b(?:kys|kill (?:yo)?urself|kill urself)\b/,
	/\bhope (?:you|u) (?:die|get cancer)\b/,
]

// The check that always runs, with no network call. Profanity and trash talk
// pass; slurs, threats and someone's personal details don't. "strict" adds a
// wider list, for questions from people who don't share a group with the
// person they're asking.
export function checkLocally(
	text: string,
	strictness: Strictness,
): ModerationResult {
	const normalized = normalize(text)
	const lettersOnly = normalized.replace(/[^a-z]/g, "")

	if (
		STANDARD_WORDS.test(normalized) ||
		ANYWHERE.test(lettersOnly) ||
		(strictness === "strict" && STRICT_WORDS.test(normalized))
	) {
		return { ok: false, category: "hate" }
	}
	if (THREATS.some((pattern) => pattern.test(normalized))) {
		return { ok: false, category: "threat" }
	}
	if (EMAIL.test(text) || PHONE.test(text) || STREET.test(text)) {
		return { ok: false, category: "personal_info" }
	}
	return { ok: true }
}
