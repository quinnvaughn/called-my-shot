// The window, the stranger cap and the asking gate are shared with the How it
// works page, which states them. Past the window, pending questions stop
// showing and what was answered stays as the record.
export {
	MIN_ACCOUNT_AGE_DAYS,
	MIN_SETTLED_CALLS,
	PRESSER_WINDOW_HOURS,
	STRANGER_QUESTION_CAP,
} from "@called-my-shot/schemas"

// The most questions built from the owner's own results that one presser
// holds at a time.
export const APP_QUESTION_COUNT = 3

// sortRank values - see presserQuestions.sortRank.
export const SORT_RANK = {
	app: 0,
	groupmate: 1,
	fader: 2,
	gameCaller: 3,
} as const
