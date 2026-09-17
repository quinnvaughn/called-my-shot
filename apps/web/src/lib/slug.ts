// Slug helpers live in @called-my-shot/schemas so the api can build the same
// question and game urls for the links in its emails. They're re-exported here
// because every consumer in this app already imports them from "#/lib/slug",
// and the two should not disagree about where a page lives.
export {
	buildGameSlug,
	buildQuestionSlug,
	gamePath,
	questionPath,
	slugify,
} from "@called-my-shot/schemas"
