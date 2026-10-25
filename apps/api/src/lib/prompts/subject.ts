// What a prompt is of, without the word Rushmore: "Rushmore of NBA point
// guards" is stored as "NBA point guards", "Celtics bench guys Rushmore" as
// "Celtics bench guys". Every place a prompt shows already says Mount
// Rushmore (the label over its title, the share image), so a title that says
// it too would read twice, and people would each phrase it differently.
const LEADING =
	/^\s*(?:my\s+)?(?:(?:mount|mt\.?)\s+)?rushmores?\b\s*(?:[:\-–—]\s*|of\s+(?:the\s+)?)?/i
const TRAILING =
	/\s*[:\-–—]?\s*\b(?:(?:mount|mt\.?)\s+)?rushmores?\s*[.!]*\s*$/i

export function promptSubject(title: string): string {
	return title.replace(LEADING, "").replace(TRAILING, "").trim()
}
