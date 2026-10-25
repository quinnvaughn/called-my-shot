import { match, P } from "ts-pattern"
import type { League } from "./types"

// Where in the app a page sits, which decides the rail tile that's lit, the
// side column beside the page, the tab row above it on phones and the bottom
// nav tab. "you" is the viewer's own profile, calls, questions and
// challenges: Home's column on desktop, its own bottom tab on phones. A team
// sits inside its league: the team's rail tile is lit when it's followed,
// the league's otherwise. A post or prompt names its own space (PageSpace).
// "elsewhere" is any page that isn't part of a space (a question, a game,
// someone else's profile): Home's column with nothing lit and no tab row.
export type Space =
	| { kind: "home" }
	| { kind: "you" }
	| { kind: "arcade" }
	| { kind: "spaces" }
	| { kind: "league"; league: League }
	| { kind: "team"; league: League; teamSlug: string }
	| { kind: "group"; groupId: string }
	| { kind: "elsewhere" }

// The space a page belongs to when its address doesn't say: a post or a
// prompt sits at a short address of its own (/posts/:id, /rushmore/:code) but
// is about a team or league, or lives in a group. Its route's loader returns
// one as `space`, and useSpace takes it for a page that would otherwise be
// "elsewhere".
export type PageSpace =
	| { kind: "league"; leagueId: string }
	| { kind: "team"; leagueId: string; teamSlug: string }
	| { kind: "group"; groupId: string }

export function spaceOfPage(page: PageSpace, leagues: League[]): Space | null {
	return match(page)
		.with(
			{ kind: "group" },
			({ groupId }): Space => ({ kind: "group", groupId }),
		)
		.with({ kind: "league" }, ({ leagueId }): Space | null => {
			const league = leagues.find((l) => l.id === leagueId)
			return league ? { kind: "league", league } : null
		})
		.with({ kind: "team" }, ({ leagueId, teamSlug }): Space | null => {
			const league = leagues.find((l) => l.id === leagueId)
			return league ? { kind: "team", league, teamSlug } : null
		})
		.exhaustive()
}

const HOME: Space = { kind: "home" }
const YOU: Space = { kind: "you" }
const ARCADE: Space = { kind: "arcade" }
const SPACES: Space = { kind: "spaces" }
const ELSEWHERE: Space = { kind: "elsewhere" }

function leagueSpace(leagues: League[], slug: unknown): Space | null {
	const league = leagues.find((l) => l.slug === slug)
	return league ? { kind: "league", league } : null
}

function teamSpace(leagues: League[], slug: string, teamSlug: string): Space {
	const league = leagues.find((l) => l.slug === slug)
	return league ? { kind: "team", league, teamSlug } : ELSEWHERE
}

export function resolveSpace(
	pathname: string,
	leagueSearch: unknown,
	leagues: League[],
	me: { username: string } | null,
): Space {
	const segments = pathname.split("/").filter(Boolean)
	const ownUsername = me?.username.toLowerCase() ?? null
	return (
		match(segments)
			.with([], () => HOME)
			// A leaderboard filtered to one league is that league's board.
			.with(["leaderboard"], () => leagueSpace(leagues, leagueSearch) ?? HOME)
			.with(
				["my-calls"],
				["my-questions"],
				["challenges"],
				["challenges", "new"],
				() => YOU,
			)
			// Only the profile itself: a streak or report card under it is a
			// page of its own.
			.with(["user", P.string], ([, username]) =>
				ownUsername !== null && username.toLowerCase() === ownUsername
					? YOU
					: ELSEWHERE,
			)
			.with(["arcade", ...P.array(P.string)], () => ARCADE)
			.with(["spaces"], () => SPACES)
			.with(["leagues", P.string, "teams", P.string], ([, slug, , teamSlug]) =>
				teamSpace(leagues, slug, teamSlug),
			)
			.with(
				["leagues", P.string, ...P.array(P.string)],
				([, slug]) => leagueSpace(leagues, slug) ?? ELSEWHERE,
			)
			// The invite landing, not a group called "join".
			.with(["groups", "join", ...P.array(P.string)], () => ELSEWHERE)
			.with(
				["groups", P.string, ...P.array(P.string)],
				([, groupId]): Space => ({ kind: "group", groupId }),
			)
			.otherwise(() => ELSEWHERE)
	)
}
