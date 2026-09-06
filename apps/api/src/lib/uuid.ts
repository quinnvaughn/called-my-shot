const UUID_RE =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Postgres uuid columns throw on malformed input rather than just not
// matching, so any resolver taking a user-supplied id for a uuid column
// needs to check this before it reaches the db.
export function isUuid(value: string): boolean {
	return UUID_RE.test(value)
}
