// How long a presser takes questions and answers after it opens. Past it,
// pending questions stop showing and what was answered stays as the record.
export const PRESSER_WINDOW_HOURS = 48

// The most questions built from the owner's own results that one presser
// holds at a time.
export const APP_QUESTION_COUNT = 3

// The most questions one presser takes from people who don't share a group
// with the owner. Groupmates have no cap beyond one question each.
export const STRANGER_QUESTION_CAP = 5

// What an account needs before it can ask a question of someone it doesn't
// share a group with, so a fresh throwaway can't.
export const MIN_ACCOUNT_AGE_DAYS = 7
export const MIN_SETTLED_CALLS = 10

// sortRank values - see presserQuestions.sortRank.
export const SORT_RANK = {
	app: 0,
	groupmate: 1,
	fader: 2,
	gameCaller: 3,
} as const
