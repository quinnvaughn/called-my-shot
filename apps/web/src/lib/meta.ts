// Absolute, because og:url has to be - and the host a share/crawl request
// arrives on isn't necessarily the one that should be indexed (Fly's
// *.fly.dev name, a preview machine). Same literal the root route and the
// sitemap already pin to.
const ORIGIN = "https://calledmyshot.com"

type PageMeta = {
	title: string
	description: string
	// Origin-relative, leading slash. Canonical for the page, so search params
	// that only vary the view (the games tab's windowKey) stay out of it.
	path: string
}

// The same title/description have to be repeated across three vocabularies:
// Facebook/iMessage/Slack/Discord read the og: tags, X reads twitter:, and
// search engines read <title>/description. A page that sets only one set
// inherits the root route's generic copy everywhere else, which is how every
// league tab ended up sharing one title. og:image and og:type aren't here -
// the root's apply to every page and nothing below it overrides them.
export function pageMeta({ title, description, path }: PageMeta) {
	const url = ORIGIN + path
	return {
		// rel=canonical rather than only og:url, because they answer different
		// questions: og:url is where a share card points back to, canonical is
		// which of several urls a crawler should treat as the page. They agree
		// here, but only canonical collapses a page's filtered variants onto the
		// bare one - the leaderboard's league/season params, the games tab's
		// windowKey.
		links: [{ rel: "canonical", href: url }],
		meta: [
			{ title },
			{ name: "description", content: description },
			{ property: "og:title", content: title },
			{ property: "og:description", content: description },
			{ property: "og:url", content: url },
			{ name: "twitter:title", content: title },
			{ name: "twitter:description", content: description },
			{ name: "twitter:url", content: url },
		],
	}
}
