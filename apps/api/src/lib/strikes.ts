// Placeholder threshold, explicitly called out as overridable rather than a
// settled product decision - see voidQuestion in graphql/types/question.ts,
// which only uses this to decide the moment questionCreationEnabled
// auto-flips false. An admin can always re-enable a user manually regardless
// of this number.
export const STRIKE_LOCK_THRESHOLD = 3
