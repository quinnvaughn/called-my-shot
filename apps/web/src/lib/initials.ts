// "Ronald Acuña Jr." -> "RA": first and last name, skipping a generational
// suffix. A single name gives a single letter.
export function initials(name: string): string {
	const words = name
		.split(/\s+/)
		.filter((w) => w && !/^(jr|sr|ii|iii|iv)\.?$/i.test(w))
	const first = words[0]?.charAt(0) ?? ""
	const last =
		words.length > 1 ? (words[words.length - 1]?.charAt(0) ?? "") : ""
	return `${first}${last}`.toUpperCase()
}
