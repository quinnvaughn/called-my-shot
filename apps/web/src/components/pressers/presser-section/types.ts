import type { PresserSection_PresserFragment } from "#/graphql/generated/graphql"

export type PresserData = PresserSection_PresserFragment

export type QuestionData = PresserData["questions"][number]
