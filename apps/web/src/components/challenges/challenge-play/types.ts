import type { ChallengePageQuery } from "#/graphql/generated/graphql"

export type Challenge = NonNullable<ChallengePageQuery["challenge"]>
export type Entry = Challenge["entries"][number]
