import type { PushPreferenceType } from "#/graphql/generated/graphql"

export type PushGroup = {
	key: string
	label: string
	description: string
	types: PushPreferenceType[]
}

// One settings toggle per group, each writing every type in it. Every pushed
// notification type belongs to exactly one (push-groups.test.ts holds that),
// so a new type has to be placed before it can ship. GROUP_PINS_EXPIRED is
// never pushed, so it has no toggle.
export const PUSH_GROUPS: PushGroup[] = [
	{
		key: "results",
		label: "Calls settle",
		description:
			"One per game when your calls on it settle, plus calls with no game and sweeps.",
		types: ["GAME_RESOLVED", "CALL_RESOLVED", "SWEEP_COMPLETED"],
	},
	{
		key: "challenges",
		label: "Challenges",
		description:
			"When someone accepts your challenge, a challenge you're in settles, someone talks trash, or a challenge is posted to your group.",
		types: [
			"CHALLENGE_ACCEPTED",
			"CHALLENGE_SETTLED",
			"CHALLENGE_GLOATED",
			"CHALLENGE_POSTED_TO_GROUP",
		],
	},
	{
		key: "reminders",
		label: "Game reminders",
		description:
			"An hour before a game you asked to be reminded about. When this reaches a device, the email isn't sent.",
		types: ["GAME_REMINDER"],
	},
	{
		key: "social",
		label: "Social and streaks",
		description:
			"Fades on your calls, people joining or sharing in your groups, streak runs, and questions at your presser.",
		types: [
			"CALL_FADED",
			"FADE_GLOATED",
			"GROUP_MEMBER_JOINED",
			"QUESTION_SHARED_TO_GROUP",
			"STREAK_MILESTONE",
			"STREAK_PERSONAL_BEST",
			"STREAK_SNAPPED",
			"PRESSER_QUESTION_RECEIVED",
			"PRESSER_ANSWERED",
		],
	},
	{
		key: "questions",
		label: "Your questions and invites",
		description:
			"Disputes and voids on questions you made or called, and redos you earn when someone you invited makes a call.",
		types: [
			"DISPUTE_FILED",
			"DISPUTE_UPHELD",
			"DISPUTE_OVERTURNED",
			"QUESTION_VOIDED",
			"CALL_VOIDED",
			"REDO_EARNED",
		],
	},
]
