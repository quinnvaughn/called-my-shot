import { db } from "../db"

// The account every isOfficial question is attributed to (see createQuestion
// in graphql/types/question/mutations/create-question.ts) - never the admin who actually clicked
// "post". Seeded once by the 20260822022433_official_account migration
// (production) and re-seeded by db/seed.ts (dev, which truncates users on
// every run) - both insert the exact same username, which is what this
// looks up rather than a hardcoded id.
export const OFFICIAL_ACCOUNT_USERNAME = "calledmyshot"

export async function getOfficialAccountId(): Promise<string> {
	const account = await db.query.users.findFirst({
		where: { username: OFFICIAL_ACCOUNT_USERNAME },
	})
	if (!account) {
		throw new Error(
			`Official account (username "${OFFICIAL_ACCOUNT_USERNAME}") is missing - run migrations before posting an official question.`,
		)
	}
	return account.id
}
