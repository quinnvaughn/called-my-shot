// A prompt's address, /rushmore/{slug}, printed on every share image, so it
// has to read as what it is and survive being typed off a screenshot:
// "Boston Red Sox" is boston-red-sox, "Rushmore of NBA point guards" is
// rushmore-of-nba-point-guards. Accents are dropped (Montréal Canadiens is
// montreal-canadiens) and anything that isn't a letter or a digit becomes a
// hyphen.

const MAX_LENGTH = 40

// Paths under /rushmore/ the app uses itself, which no prompt can take.
const RESERVED = new Set(["new"])

export function promptSlug(text: string): string {
	const slug = text
		.normalize("NFKD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, MAX_LENGTH)
		.replace(/-+$/g, "")
	return slug && !RESERVED.has(slug) ? slug : `${slug || "rushmore"}-1`
}

// What a typed slug looks like before it's looked up: stored lowercase, and
// nobody typing one should have to care.
export function normalizePromptCode(code: string): string {
	return code.trim().toLowerCase()
}
