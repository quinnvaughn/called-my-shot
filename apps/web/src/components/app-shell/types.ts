import type { SeasonPhase } from "#/graphql/generated/graphql"

export type Me = {
	name: string
	username: string
	avatarUrl: string | null
	isAdmin: boolean
	emailBouncedAt?: string | null
} | null

export type League = {
	id: string
	name: string
	abbreviation: string
	slug: string
	currentSeason?: { phase: SeasonPhase } | null
}
