// The NBA's own player ids, which its CDN keys headshots and logos by (see
// league-images.ts). nba.com/players server-renders the league's full current
// player list into its Next.js page data, and that page is the source because
// no JSON endpoint serves the list to a plain request: stats.nba.com hangs
// without browser-only headers and cdn.nba.com's static index is 403. A
// layout change on nba.com breaks this the way a shape change breaks
// mlb-stats-client.ts.
const PLAYERS_PAGE_URL = "https://www.nba.com/players"

export type NbaPlayer = {
	PERSON_ID: number
	PLAYER_FIRST_NAME: string
	PLAYER_LAST_NAME: string
	TEAM_ID: number
	// "Sacramento" + "Kings", which together match ESPN's team displayName for
	// all 30 teams (verified live) where the abbreviations don't (ESPN's GS/NY
	// vs the NBA's GSW/NYK).
	TEAM_CITY: string
	TEAM_NAME: string
}

const NEXT_DATA =
	/<script id="__NEXT_DATA__" type="application\/json">(.*?)<\/script>/s

export async function fetchNbaPlayers(): Promise<NbaPlayer[]> {
	const res = await fetch(PLAYERS_PAGE_URL, {
		headers: { "User-Agent": "Mozilla/5.0" },
	})
	if (!res.ok) {
		throw new Error(`nba.com players page request failed (${res.status})`)
	}
	const json = (await res.text()).match(NEXT_DATA)?.[1]
	if (!json) throw new Error("nba.com players page has no __NEXT_DATA__")
	const data = JSON.parse(json) as {
		props?: { pageProps?: { players?: NbaPlayer[] } }
	}
	const players = data.props?.pageProps?.players
	if (!players) throw new Error("nba.com players page has no players list")
	return players
}
