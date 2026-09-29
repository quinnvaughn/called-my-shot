export type ProfileFacts = {
	username: string
	totalPoints: number
	rank: number | null
	accuracy: number | null
}

export function buildProfileTweet(
	facts: ProfileFacts & { isOwn: boolean },
): string {
	const line = [
		`${facts.totalPoints.toLocaleString()} points`,
		facts.accuracy !== null ? `${Math.round(facts.accuracy)}% accuracy` : null,
		facts.rank !== null ? `ranked #${facts.rank}` : null,
	]
		.filter((part) => part !== null)
		.join(", ")
	return facts.isOwn
		? `My track record on Called My Shot: ${line}.`
		: `@${facts.username}'s track record on Called My Shot: ${line}.`
}

// Changes whenever a number on the og:image does, so an unfurl cache holding
// an older render is handed a url it has never scraped. Resolved count moves
// with every settled call, which is also when the calendar gains a shade.
export function profileCardVersion(input: {
	totalPoints: number
	resolvedCallCount: number
	rank: number | null
}): string {
	return [
		input.totalPoints,
		input.resolvedCallCount,
		input.rank ?? "unranked",
	].join("-")
}
