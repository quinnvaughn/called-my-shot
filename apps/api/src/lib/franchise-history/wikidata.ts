import { politeFetch } from "./http"

// Wikidata is the crosswalk between the reference sites' player ids and
// ESPN's (and Wikipedia's article titles, for the portrait fallback). One
// SPARQL query per league answers it for every player at once.
const ENDPOINT = "https://query.wikidata.org/sparql"

type Binding = Record<string, { value: string } | undefined>

// Each result row as a plain map of variable name to value. A variable the
// row left unbound (an OPTIONAL with no match) is simply absent.
export async function sparql(query: string): Promise<Record<string, string>[]> {
	const res = await politeFetch(ENDPOINT, {
		method: "POST",
		headers: {
			Accept: "application/sparql-results+json",
			"Content-Type": "application/x-www-form-urlencoded",
		},
		body: new URLSearchParams({ query }).toString(),
		signal: AbortSignal.timeout(300_000),
	})
	if (!res.ok) {
		throw new Error(
			`Wikidata query failed (${res.status}): ${await res.text()}`,
		)
	}
	const json = (await res.json()) as { results: { bindings: Binding[] } }
	return json.results.bindings.map((row) => {
		const out: Record<string, string> = {}
		for (const [key, cell] of Object.entries(row)) {
			if (cell) out[key] = cell.value
		}
		return out
	})
}

// The English Wikipedia article title from a sitelink URL
// ("https://en.wikipedia.org/wiki/Bill_Russell" -> "Bill Russell").
export function articleTitle(url: string | undefined): string | null {
	if (!url) return null
	const slug = url.split("/wiki/")[1]
	return slug ? decodeURIComponent(slug).replaceAll("_", " ") : null
}

// The SPARQL fragment binding ?article to an item's English Wikipedia page.
export const ENWIKI_ARTICLE = `OPTIONAL { ?article schema:about ?p ; schema:isPartOf <https://en.wikipedia.org/> }`
