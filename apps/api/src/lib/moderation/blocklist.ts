// Base64 so the source doesn't read as a list of slurs. Decoded once at
// load by lib/moderation/local.ts. Lowercase, no leetspeak - the text is
// normalized to match.

// Matched as whole words, plurals included.
export const STANDARD_TERMS = [
	"bmlnZ2Vy",
	"bmlnZ2E=",
	"ZmFnZ290",
	"ZmFn",
	"a2lrZQ==",
	"c3BpYw==",
	"Y2hpbms=",
	"Z29vaw==",
	"d2V0YmFjaw==",
	"YmVhbmVy",
	"cmFnaGVhZA==",
	"dG93ZWxoZWFk",
	"dHJhbm55",
	"ZHlrZQ==",
	"Y29vbg==",
	"cGFraQ==",
	"c2FuZG5pZ2dlcg==",
	"cG9yY2htb25rZXk=",
	"anVuZ2xlYnVubnk=",
]

// Also matched inside the letters-only text, which catches spaced and dotted
// spellings. Only terms that never sit innocently inside another word.
export const ANYWHERE_TERMS = [
	"bmlnZ2Vy",
	"bmlnZ2E=",
	"ZmFnZ290",
	"a2lrZQ==",
	"d2V0YmFjaw==",
	"dHJhbm55",
	"cG9yY2htb25rZXk=",
	"anVuZ2xlYnVubnk=",
]

// Added for people asking someone they don't share a group with.
export const STRICT_TERMS = ["cmV0YXJk", "cmV0YXJkZWQ=", "dGFyZA=="]
