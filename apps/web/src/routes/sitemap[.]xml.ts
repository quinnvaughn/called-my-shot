import { createFileRoute } from "@tanstack/react-router"
import { gqlFetch } from "#/graphql/fetcher"
import {
	SitemapLeagueBallotsDocument,
	SitemapLeaguesDocument,
} from "#/graphql/queries/sitemap"

// Sitemap entries have to be absolute, and the host a crawler asks on isn't
// necessarily the one it should index (Fly's *.fly.dev name, a preview
// machine). Same literal the root route's og:url/og:image already pin to.
const ORIGIN = "https://calledmyshot.com"

// Every public page that isn't derived from data. The rest of the app is
// either behind _authed (home, settings, my-calls, ...), admin-only, or
// reached from a link nobody should be indexing (group invites, email
// confirmation) - see public/robots.txt for the matching disallow list.
const STATIC_PATHS = ["/", "/how-it-works", "/leaderboard"]

// The league room's tabs. Its bare /leagues/$slug url is not listed: it only
// redirects to the games tab (see leagues/$leagueSlug/index.tsx), and a
// sitemap entry that redirects is a warning in Search Console rather than an
// indexed page.
const LEAGUE_TABS = ["games", "feed", "season"]

function escapeXml(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&apos;")
}

async function collectPaths(): Promise<string[]> {
	const paths = [...STATIC_PATHS]

	const { leagues } = await gqlFetch(SitemapLeaguesDocument, {})
	// An inactive league is one the app shows as "coming soon" - browsable,
	// but with no games, feed or ballots behind it yet.
	const listed = leagues.filter((league) => league.status === "ACTIVE")

	for (const league of listed) {
		for (const tab of LEAGUE_TABS) {
			paths.push(`/leagues/${league.slug}/${tab}`)
		}
	}

	// `leagueBallots` takes one league at a time, and there are only ever a
	// handful of leagues - cheaper to fan out over them than to add a batched
	// field to the api for this one caller.
	const ballotsByLeague = await Promise.all(
		listed.map((league) =>
			gqlFetch(SitemapLeagueBallotsDocument, { leagueId: league.id }),
		),
	)

	for (const { leagueBallots } of ballotsByLeague) {
		for (const ballot of leagueBallots) {
			paths.push(`/ballots/${ballot.slug}`)
		}
	}

	// Nothing upstream promises these are distinct - a ballot slug reused
	// across two leagues would otherwise be listed twice, which a validator
	// flags even though crawlers collapse it themselves.
	return [...new Set(paths)]
}

function renderSitemap(paths: readonly string[]): string {
	// <loc> only. Google ignores <changefreq> and <priority> outright, and
	// nothing here carries a trustworthy updated-at to put in <lastmod> - a
	// made-up one is worse than none, since a crawler that learns the dates
	// are noise stops using them.
	const urls = paths
		.map(
			(path) => `\t<url>\n\t\t<loc>${escapeXml(ORIGIN + path)}</loc>\n\t</url>`,
		)
		.join("\n")

	return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`
}

export const Route = createFileRoute("/sitemap.xml")({
	server: {
		handlers: {
			GET: async () => {
				let paths: string[]
				try {
					paths = await collectPaths()
				} catch {
					// The api being unreachable shouldn't take the whole sitemap
					// down with it: a 5xx here makes a crawler drop every url it
					// had learned from this file, where a short static one just
					// leaves the dynamic pages to be rediscovered on the next
					// fetch.
					paths = [...STATIC_PATHS]
				}

				return new Response(renderSitemap(paths), {
					headers: {
						"content-type": "application/xml; charset=utf-8",
						"cache-control": "public, max-age=3600",
					},
				})
			},
		},
	},
})
