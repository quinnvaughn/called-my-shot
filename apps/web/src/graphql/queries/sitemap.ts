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

// One call per listed league, covering all three of that league's indexable
// url families at once rather than a round trip each.
//
// The extra fields beyond `id` are what buildGameSlug/buildQuestionSlug need
// to reproduce each page's canonical url - the slug is derived, never stored,
// so there is nothing to just read back.
//
// Every field here is already scoped to the current season by its own
// resolver: `leagueBallots` to published ballots (the same set the league
// room's Season tab links to, so the sitemap never advertises a draft or a
// prior year's award ballot), and the two sitemap* fields to that season's
// games and official questions. Nothing but this file should use the
// sitemap* fields - they are unpaginated by design.
export const SitemapLeagueContentDocument = graphql(`
	query SitemapLeagueContent($leagueId: ID!) {
		leagueBallots(leagueId: $leagueId) {
			slug
		}
		sitemapGames(leagueId: $leagueId) {
			id
			startsAt
			league {
				slug
			}
			homeTeam {
				name
			}
			awayTeam {
				name
			}
		}
		sitemapQuestions(leagueId: $leagueId) {
			id
			title
		}
	}
`)
