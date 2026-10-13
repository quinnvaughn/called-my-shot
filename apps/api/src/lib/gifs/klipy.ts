import { createHash } from "node:crypto"
import { env } from "../../env"

// Klipy's GIF API, proxied so the key never reaches the browser. The key sits
// in the path rather than a header; customer_id is a stable stand-in for the
// person searching, hashed so Klipy never sees a real user id.
const BASE_URL = "https://api.klipy.com/api/v1"
const PER_PAGE = 24
const TIMEOUT_MS = 5000

export type KlipyGif = {
	// The slug: what share and report calls name a GIF by.
	id: string
	url: string
	previewUrl: string
	width: number
	height: number
	alt: string
}

type KlipyFile = { url?: string; width?: number; height?: number }
type KlipyItem = {
	id?: number | string
	slug?: string
	title?: string
	file?: Record<string, Record<string, KlipyFile | undefined> | undefined>
}

export function isKlipyConfigured(): boolean {
	return Boolean(env.KLIPY_API_KEY)
}

export function klipyCustomerId(userId: string): string {
	return createHash("sha256")
		.update(`klipy:${userId}`)
		.digest("hex")
		.slice(0, 32)
}

// The first size that has a GIF, in the order given.
function pickFile(
	item: KlipyItem,
	sizes: string[],
): Required<KlipyFile> | null {
	for (const size of sizes) {
		const file = item.file?.[size]?.gif
		if (file?.url && file.width && file.height) {
			return { url: file.url, width: file.width, height: file.height }
		}
	}
	return null
}

// What the picker and a sent gloat need from one result. Null for a result
// missing any usable file, which the picker just leaves out.
export function normalizeKlipyItem(item: KlipyItem): KlipyGif | null {
	const id = item.slug ?? (item.id != null ? String(item.id) : null)
	const full = pickFile(item, ["md", "sm", "hd", "xs"])
	const preview = pickFile(item, ["sm", "xs", "md", "hd"])
	if (!id || !full || !preview) return null
	return {
		id,
		url: full.url,
		previewUrl: preview.url,
		width: full.width,
		height: full.height,
		alt: item.title?.trim() ?? "",
	}
}

async function klipy(
	path: string,
	init: { method?: "GET" | "POST"; query?: Record<string, string> } = {},
): Promise<unknown> {
	const key = env.KLIPY_API_KEY
	if (!key) return null
	const url = new URL(`${BASE_URL}/${key}/gifs/${path}`)
	for (const [name, value] of Object.entries(init.query ?? {})) {
		url.searchParams.set(name, value)
	}
	const response = await fetch(url, {
		method: init.method ?? "GET",
		signal: AbortSignal.timeout(TIMEOUT_MS),
	})
	if (!response.ok) throw new Error(`Klipy ${path} failed: ${response.status}`)
	return response.json()
}

function itemsOf(body: unknown): KlipyGif[] {
	const data = (body as { data?: { data?: unknown } } | null)?.data?.data
	if (!Array.isArray(data)) return []
	return data.flatMap((item) => normalizeKlipyItem(item as KlipyItem) ?? [])
}

export async function searchGifs(input: {
	query: string
	page: number
	userId: string
}): Promise<KlipyGif[]> {
	return itemsOf(
		await klipy("search", {
			query: {
				q: input.query,
				page: String(input.page),
				per_page: String(PER_PAGE),
				customer_id: klipyCustomerId(input.userId),
			},
		}),
	)
}

export async function trendingGifs(input: {
	page: number
	userId: string
}): Promise<KlipyGif[]> {
	return itemsOf(
		await klipy("trending", {
			query: {
				page: String(input.page),
				per_page: String(PER_PAGE),
				customer_id: klipyCustomerId(input.userId),
			},
		}),
	)
}

// Tells Klipy a GIF was sent, which its guidelines ask for and which feeds
// its trending. Never allowed to hold up or fail the send.
export function registerGifShare(slug: string, userId: string): void {
	void klipy(`${encodeURIComponent(slug)}/share`, {
		method: "POST",
		query: { customer_id: klipyCustomerId(userId) },
	}).catch(() => {})
}

// Passes a report on a GIF along to Klipy, alongside our own.
export function reportGifToKlipy(
	slug: string,
	userId: string,
	reason: string,
): void {
	void klipy(`${encodeURIComponent(slug)}/report`, {
		method: "POST",
		query: { customer_id: klipyCustomerId(userId), reason },
	}).catch(() => {})
}

// Searches per person per minute, kept in memory: enough to stop a stuck
// client hammering the proxy, which is all this is for.
const SEARCHES_PER_MINUTE = 60
const recent = new Map<string, number[]>()

export function allowGifSearch(userId: string, now = Date.now()): boolean {
	const since = now - 60_000
	const times = (recent.get(userId) ?? []).filter((t) => t > since)
	if (times.length >= SEARCHES_PER_MINUTE) {
		recent.set(userId, times)
		return false
	}
	times.push(now)
	recent.set(userId, times)
	return true
}
