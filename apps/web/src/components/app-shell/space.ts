import { match, P } from "ts-pattern"
import type { League } from "./types"

// Where in the app a page sits, which decides the rail tile that's lit, the
// side column beside the page, the tab row above it on phones and the bottom
// nav tab. "you" is the viewer's own calls, questions and challenges: Home's
// column on desktop, its own bottom tab on phones. "elsewhere" is any page
// that isn't part of a space (a question, a game, a profile): Home's column
// with nothing lit and no tab row.
export type Space =
	| { kind: "home" }
	| { kind: "you" }
	| { kind: "arcade" }
	| { kind: "spaces" }
	| { kind: "league"; league: League }
	| { kind: "group"; groupId: string }
	| { kind: "elsewhere" }

const HOME: Space = { kind: "home" }
const YOU: Space = { kind: "you" }
const ARCADE: Space = { kind: "arcade" }
const SPACES: Space = { kind: "spaces" }
const ELSEWHERE: Space = { kind: "elsewhere" }

function leagueSpace(leagues: League[], slug: unknown): Space | null {
	const league = leagues.find((l) => l.slug === slug)
	return league ? { kind: "league", league } : null
}

export function resolveSpace(
	pathname: string,
	leagueSearch: unknown,
	leagues: League[],
): Space {
	const segments = pathname.split("/").filter(Boolean)
	return (
		match(segments)
			.with(["home"], () => HOME)
			// A leaderboard filtered to one league is that league's board.
			.with(["leaderboard"], () => leagueSpace(leagues, leagueSearch) ?? HOME)
			.with(
				["my-calls"],
				["my-questions"],
				["challenges"],
				["challenges", "new"],
				() => YOU,
			)
			.with(["arcade", ...P.array(P.string)], () => ARCADE)
			.with(["spaces"], () => SPACES)
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
