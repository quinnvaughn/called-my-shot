import type {
	ChallengeEntry_EntryFragment,
	ChallengeMatchupRows_MatchupFragment,
} from "#/graphql/generated/graphql"

export type Entry = ChallengeEntry_EntryFragment

export type Row = ChallengeMatchupRows_MatchupFragment["rows"][number]

export type Call = NonNullable<Entry["creatorCall"]>
