import type { GameStarters_GameFragment } from "#/graphql/generated/graphql"

export type Starter = GameStarters_GameFragment["starters"][number]

export type Team = GameStarters_GameFragment["homeTeam"]
