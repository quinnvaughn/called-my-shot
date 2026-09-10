// The get-started checklist's contents, derived rather than stored.
//
// Kept apart from the component so the interesting part - which steps apply to
// this account, which are already satisfied, what order they go in - is plain
// data that can be tested directly.

export type OnboardingStepId =
	| "call"
	| "leaderboard"
	| "group"
	| "verify-email"
	| "question"

export type OnboardingFacts = {
	hasCalled: boolean
	hasGroup: boolean
	hasCreatedQuestion: boolean
	emailVerified: boolean
	// False means an admin suspended this account's question creation. Not the
	// same as unverified: unverified is a step you can clear yourself, suspended
	// is not, so the post-a-question step is dropped entirely rather than shown
	// as something to go do.
	questionCreationEnabled: boolean
}

export type OnboardingStep = {
	id: OnboardingStepId
	title: string
	body: string
	done: boolean
	// Set when the step can't be acted on yet and says what has to happen
	// first. Only "question" ever has one.
	blockedBy?: OnboardingStepId
}

export function onboardingSteps(facts: OnboardingFacts): OnboardingStep[] {
	const steps: OnboardingStep[] = [
		{
			id: "call",
			title: "Make your first call",
			body: "Pick the outcome you believe, then set your conviction. That single number scales what a hit pays and what a miss costs. One call per question, and it locks when the event starts.",
			done: facts.hasCalled,
		},
		{
			// Shares the call's completion signal on purpose. There is no
			// separate thing to do here: a resolved call is what puts you on the
			// board, so tying this to a "visited the page" flag would tick for
			// someone who is still nowhere on it.
			id: "leaderboard",
			title: "See where you rank",
			body: "Every call that resolves moves your points and your accuracy. The leaderboard sorts by points for the season and shows accuracy beside it, so volume alone doesn't carry you.",
			done: facts.hasCalled,
		},
		{
			id: "group",
			title: "Start a group",
			body: "A group is a private leaderboard for people you know. Same calls and the same scoring, ranked among your friends instead of everyone. Making one hands you the invite link straight away.",
			done: facts.hasGroup,
		},
	]

	// Only worth listing while it is outstanding. A verified account does not
	// need a ticked row telling it so.
	if (!facts.emailVerified) {
		steps.push({
			id: "verify-email",
			title: "Verify your email",
			body: "We sent you a link the moment you signed up, so check your inbox. It confirms there's a real person behind the account, which is what unlocks posting questions of your own. Settings can send a fresh one if it never arrived.",
			done: false,
		})
	}

	if (facts.questionCreationEnabled) {
		steps.push({
			id: "question",
			title: "Post your own question",
			body: "Anything with a public result somebody could check. You write the options and name the source it resolves against, and anyone can call it.",
			done: facts.hasCreatedQuestion,
			blockedBy: facts.emailVerified ? undefined : "verify-email",
		})
	}

	return steps
}

export function completedCount(steps: OnboardingStep[]): number {
	return steps.filter((s) => s.done).length
}

// Whether the checklist has anything left to say. Finishing it retires it
// without anyone having to dismiss it.
export function isOnboardingComplete(steps: OnboardingStep[]): boolean {
	return steps.every((s) => s.done)
}
