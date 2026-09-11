// Absolute, because og:url has to be - and the host a share/crawl request
// arrives on isn't necessarily the one that should be indexed (Fly's
// *.fly.dev name, a preview machine). Set VITE_SITE_ORIGIN locally
// (http://localhost:3000) so copied share links open the dev server; unset,
// it's the production origin the root route and the sitemap pin to. `||`
// rather than `??` because a build arg that was never passed arrives as an
// empty string.
export const SITE_ORIGIN =
	(import.meta.env.VITE_SITE_ORIGIN as string | undefined)?.replace(
		/\/$/,
		"",
	) || "https://calledmyshot.com"

// What a share row prints in place of the full url ("calledmyshot.com",
// "localhost:3000").
export const SITE_HOST = new URL(SITE_ORIGIN).host

type PageMeta = {
	title: string
	description: string
	// Origin-relative, leading slash. Canonical for the page, so search params
	// that only vary the view (the games tab's windowKey) stay out of it.
	path: string
	// Origin-relative, leading slash. Overrides the root route's site-wide
	// /og-image.png for this page alone. Must be 1200x630: that is what
	// summary_large_image crops to, and the width/height hints below are what
	// stop Slack and Discord reserving the wrong box before the bytes land.
	image?: { path: string; alt: string }
}

// The same title/description have to be repeated across three vocabularies:
// Facebook/iMessage/Slack/Discord read the og: tags, X reads twitter:, and
// search engines read <title>/description. A page that sets only one set
// inherits the root route's generic copy everywhere else, which is how every
// league tab ended up sharing one title.
//
// og:image is optional here and unset on most pages, which leaves the root's
// site-wide graphic in place. Passing one really does replace it rather than
// adding a second: the router builds head tags by walking matches
// deepest-first and keeping the first entry per name/property, so the child
// route wins. og:type is still nobody's business but the root's.
export function pageMeta({ title, description, path, image }: PageMeta) {
	const url = SITE_ORIGIN + path
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
			...(image
				? [
						{ property: "og:image", content: SITE_ORIGIN + image.path },
						{ property: "og:image:width", content: "1200" },
						{ property: "og:image:height", content: "630" },
						{ property: "og:image:alt", content: image.alt },
						// The root already sets this, but a page that ships its own
						// image shouldn't depend on that staying true.
						{ name: "twitter:card", content: "summary_large_image" },
						{ name: "twitter:image", content: SITE_ORIGIN + image.path },
						{ name: "twitter:image:alt", content: image.alt },
					]
				: []),
		],
	}
}
