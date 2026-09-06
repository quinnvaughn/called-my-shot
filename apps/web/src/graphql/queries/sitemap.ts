import { graphql } from "#/graphql/generated"

// Backs /sitemap.xml (routes/sitemap[.]xml.ts). Deliberately thinner than
// LeaguesDocument (queries/sports.ts): the sitemap only needs each league's
// slug to build its urls and its status to decide whether to list it at all,
// not the seasons the league rail carries around.
export const SitemapLeaguesDocument = graphql(`
	query SitemapLeagues {
		leagues {
			id
			slug
			status
		}
	}
`)

// One call per listed league. `leagueBallots` already narrows to published
// ballots in the current season - the same set the league room's Season tab
// links to, so the sitemap never advertises a draft or a prior year's award
// ballot.
export const SitemapLeagueBallotsDocument = graphql(`
	query SitemapLeagueBallots($leagueId: ID!) {
		leagueBallots(leagueId: $leagueId) {
			slug
		}
	}
`)
