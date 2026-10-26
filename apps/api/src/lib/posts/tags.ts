import type { PostTagRole, SpaceKind } from "../../db/schema"

export type DerivedTag = {
	spaceKind: SpaceKind
	spaceId: string
	role: PostTagRole
}

// The spaces a Rushmore shows up in, worked out once when it's posted (see
// post_tags). The prompt is the subject: a team prompt is that team's post
// and its league's, a league prompt only the league's. Each pick is a
// mention of that player and nothing more, so a Garnett pick on a Celtics
// Rushmore never lands it in the Timberwolves' space.
//
// A prompt open to every sport has no subject, so it's mentioned in each
// league its picks played in (pickLeagueIds): a Boston sports Rushmore with
// Russell and Brady shows in the NBA and the NFL, never in a team's space.
export function rushmoreTags(
	prompt: { leagueId: string | null; teamId: string | null },
	playerIds: string[],
	pickLeagueIds: string[] = [],
): DerivedTag[] {
	const subjects: DerivedTag[] = [
		...(prompt.teamId
			? [
					{
						spaceKind: "team" as const,
						spaceId: prompt.teamId,
						role: "subject" as const,
					},
				]
			: []),
		...(prompt.leagueId
			? [
					{
						spaceKind: "league" as const,
						spaceId: prompt.leagueId,
						role: "subject" as const,
					},
				]
			: [...new Set(pickLeagueIds)].map(
					(leagueId): DerivedTag => ({
						spaceKind: "league",
						spaceId: leagueId,
						role: "mention",
					}),
				)),
	]
	const mentions = [...new Set(playerIds)].map(
		(playerId): DerivedTag => ({
			spaceKind: "player",
			spaceId: playerId,
			role: "mention",
		}),
	)
	return [...subjects, ...mentions]
}

// A redraft is its league's post, the class being the league's own, and a
// mention of each player in it. The teams that held its picks aren't tagged:
// every first round would otherwise land in thirty team spaces.
export function redraftTags(
	prompt: { leagueId: string },
	playerIds: string[],
): DerivedTag[] {
	return [
		{ spaceKind: "league", spaceId: prompt.leagueId, role: "subject" },
		...[...new Set(playerIds)].map(
			(playerId): DerivedTag => ({
				spaceKind: "player",
				spaceId: playerId,
				role: "mention",
			}),
		),
	]
}
