import { match } from "ts-pattern"
import type { HistoryLeague } from "../franchise-history/franchise-map"
import { fetchJson } from "../franchise-history/http"
import {
	articleTitle,
	ENWIKI_ARTICLE,
	sparql,
} from "../franchise-history/wikidata"
import type { PortraitSubject } from "./sources"

// The last-resort photo: the lead image of the player's English Wikipedia
// article, found through Wikidata from the id his history source gave him.
// pilicense=any includes the non-free photos Wikipedia hosts for players who
// have nothing on Commons, which is most of the pre-1960 ones.

const BATCH = 200
const TITLES_PER_REQUEST = 50

// How each league's history id is written in Wikidata, and the property it
// sits under. NFL players are found by ESPN id where they have one, and
// otherwise by name and birth date (nflverse's key for a pre-1999 player).
function wikidataKey(
	subject: PortraitSubject,
): { prop: string; value: string } | null {
	const id = subject.historyId
	return match(subject.league)
		.with("nba", () => (id ? { prop: "P2685", value: `${id[0]}/${id}` } : null))
		.with("mlb", () => (id ? { prop: "P3541", value: id } : null))
		.with("nhl", () => (id ? { prop: "P3522", value: id } : null))
		.with("nfl", () =>
			subject.espnId ? { prop: "P3686", value: subject.espnId } : null,
		)
		.exhaustive()
}

type WikiInfo = { title: string | null; bbrefId: string | null }

function chunk<T>(items: T[], size: number): T[][] {
	const out: T[][] = []
	for (let i = 0; i < items.length; i += size)
		out.push(items.slice(i, i + size))
	return out
}

const literal = (value: string) => JSON.stringify(value)

// Wikidata item lookups by id, one query per batch of players.
async function byIds(
	league: HistoryLeague,
	subjects: PortraitSubject[],
): Promise<Map<string, WikiInfo>> {
	const out = new Map<string, WikiInfo>()
	const keyed = subjects.flatMap((subject) => {
		const key = wikidataKey(subject)
		return key ? [{ subject, key }] : []
	})
	const prop = keyed[0]?.key.prop
	if (!prop) return out
	for (const batch of chunk(keyed, BATCH)) {
		const rows = await sparql(`SELECT ?id ?article ?bbref WHERE {
			VALUES ?id { ${batch.map(({ key }) => literal(key.value)).join(" ")} }
			?p wdt:${prop} ?id .
			${ENWIKI_ARTICLE}
			${league === "mlb" ? "OPTIONAL { ?p wdt:P1825 ?bbref }" : ""}
		}`)
		const byValue = new Map(rows.map((row) => [row.id, row]))
		for (const { subject, key } of batch) {
			const row = byValue.get(key.value)
			if (!row) continue
			out.set(subject.playerId, {
				title: articleTitle(row.article),
				bbrefId: row.bbref ?? null,
			})
		}
	}
	return out
}

// nflverse keys a player with no GSIS id as "name|birth date".
const nflNameAndBirth = (historyId: string | null) => {
	const [name, birth] = (historyId ?? "").split("|")
	return name && birth && /^\d{4}-\d{2}-\d{2}$/.test(birth)
		? { name, birth }
		: null
}

// Pro Football Reference players on Wikidata born on the same day, matched
// on surname.
async function nflByBirth(
	subjects: PortraitSubject[],
): Promise<Map<string, WikiInfo>> {
	const out = new Map<string, WikiInfo>()
	const keyed = subjects.flatMap((subject) => {
		const key = subject.espnId ? null : nflNameAndBirth(subject.historyId)
		return key ? [{ subject, key }] : []
	})
	for (const batch of chunk(keyed, BATCH)) {
		const dates = [...new Set(batch.map(({ key }) => key.birth))]
		const rows = await sparql(`SELECT ?dob ?name ?article WHERE {
			VALUES ?dob { ${dates.map((d) => `"${d}T00:00:00Z"^^xsd:dateTime`).join(" ")} }
			?p wdt:P569 ?dob ; wdt:P3561 ?pfr ; rdfs:label ?name .
			FILTER(lang(?name) = "en")
			${ENWIKI_ARTICLE}
		}`)
		for (const { subject, key } of batch) {
			const surname = key.name.split(" ").pop() ?? ""
			const row = rows.find(
				(r) =>
					r.dob?.startsWith(key.birth) &&
					r.name?.toLowerCase().includes(surname),
			)
			if (row) {
				out.set(subject.playerId, {
					title: articleTitle(row.article),
					bbrefId: null,
				})
			}
		}
	}
	return out
}

type PageImages = {
	query?: {
		normalized?: { from: string; to: string }[]
		redirects?: { from: string; to: string }[]
		pages?: { title: string; thumbnail?: { source: string } }[]
	}
}

// Article title -> lead image URL, 50 titles a request.
async function leadImages(titles: string[]): Promise<Map<string, string>> {
	const out = new Map<string, string>()
	for (const batch of chunk([...new Set(titles)], TITLES_PER_REQUEST)) {
		const params = new URLSearchParams({
			action: "query",
			prop: "pageimages",
			piprop: "thumbnail",
			pithumbsize: "800",
			pilicense: "any",
			redirects: "1",
			format: "json",
			formatversion: "2",
			titles: batch.join("|"),
		})
		const json = await fetchJson<PageImages>(
			`https://en.wikipedia.org/w/api.php?${params}`,
		)
		const images = new Map(
			(json.query?.pages ?? []).flatMap((page) =>
				page.thumbnail ? [[page.title, page.thumbnail.source]] : [],
			),
		)
		const renamed = new Map(
			[...(json.query?.normalized ?? []), ...(json.query?.redirects ?? [])].map(
				(step) => [step.from, step.to],
			),
		)
		for (const title of batch) {
			let resolved = title
			for (let hops = 0; hops < 3 && renamed.has(resolved); hops++) {
				resolved = renamed.get(resolved) as string
			}
			const image = images.get(resolved)
			if (image) out.set(title, image)
		}
	}
	return out
}

// Fills in wikipediaImage (and an MLB player's bbrefId) on each subject.
export async function addWikipediaPhotos(
	subjects: PortraitSubject[],
): Promise<void> {
	const info = new Map<string, WikiInfo>()
	const leagues = [...new Set(subjects.map((subject) => subject.league))]
	for (const league of leagues) {
		const inLeague = subjects.filter((subject) => subject.league === league)
		for (const [id, value] of await byIds(league, inLeague)) info.set(id, value)
		if (league === "nfl") {
			for (const [id, value] of await nflByBirth(inLeague)) info.set(id, value)
		}
	}
	const images = await leadImages(
		[...info.values()].flatMap((value) => (value.title ? [value.title] : [])),
	)
	for (const subject of subjects) {
		const found = info.get(subject.playerId)
		subject.bbrefId = found?.bbrefId ?? null
		subject.wikipediaImage = found?.title
			? (images.get(found.title) ?? null)
			: null
	}
}
