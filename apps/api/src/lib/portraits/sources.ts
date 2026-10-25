import sharp from "sharp"
import { match } from "ts-pattern"
import type { HistoryLeague } from "../franchise-history/franchise-map"
import { politeFetch } from "../franchise-history/http"
import { CUTOUT_SHARE, transparentShare } from "./portrait-image"

// Where a player's photo can come from, best first, per league. Each source
// knows how it says "no photo": some 404, some redirect, and some answer 200
// with a stock silhouette that has to be recognised by its size or ETag.
//
// A source marked cutout serves the player already cut out of his
// background (the league CDNs' transparent PNGs); a photo with its background
// in is used as it is. Whether an image really is a cutout is checked from
// its alpha either way, since that decides how it's cropped
// (portrait-image.ts): NHL mugshots are transparent from about 2019 on and
// opaque before.

export type PortraitSubject = {
	playerId: string
	name: string
	league: HistoryLeague
	headshotUrl: string | null
	// The player's id in his league's history source (external_refs): a
	// Basketball-Reference id, MLBAM id, NHL id or nflverse key.
	historyId: string | null
	espnId: string | null
	// From the offline Wikipedia lookup (see wiki.ts).
	wikipediaImage?: string | null
	// Baseball-Reference id, for an MLB player's bref page photo.
	bbrefId?: string | null
}

export type PortraitCandidate = {
	source: string
	cutout: boolean
	// Resolves to the image bytes, or null when this source has no photo of
	// him.
	fetch: () => Promise<Buffer | null>
}

export type PortraitPhoto = {
	source: string
	image: Buffer
	// Judged from the image's own alpha, not the source's claim.
	cutout: boolean
}

// NBA.com answers a missing id with a silhouette of exactly this size.
export const NBA_PLACEHOLDER_BYTES = 12_430
// NFL.com serves one shared helmet image for players it has no photo of.
// Its ETag at the f_png,w_48 transform is fixed, so a HEAD tells them apart.
export const NFL_PLACEHOLDER_ETAG = '"05be4042963d6b2843dc7ab0278da32f"'

const NBA_HEADSHOT =
	/cdn\.nba\.com\/headshots\/nba\/latest\/\d+x\d+\/(\d+)\.png/
const MLB_PERSON = /\/v1\/people\/(\d+)\//
const NFL_IMAGE_KEY =
	/static\.www\.nfl\.com\/image\/(?:private|upload)\/[^/]+\/league\/([a-z0-9]+)/
const ESPN_NFL = /a\.espncdn\.com\/i\/headshots\/nfl\/players\/full\/\d+\.png/

// GETs an image, null for any status but 200 or a body that isn't an image.
async function getImage(
	url: string,
	isPlaceholder: (body: Buffer) => boolean = () => false,
): Promise<Buffer | null> {
	const res = await politeFetch(url)
	if (res.status !== 200) {
		await res.body?.cancel()
		return null
	}
	const body = Buffer.from(await res.arrayBuffer())
	if (isPlaceholder(body)) return null
	try {
		const meta = await sharp(body).metadata()
		return meta.width && meta.height ? body : null
	} catch {
		return null
	}
}

export const nbaCdnUrl = (nbaId: string) =>
	`https://cdn.nba.com/headshots/nba/latest/1040x760/${nbaId}.png`

export const mlbCutoutUrl = (mlbamId: string) =>
	`https://img.mlbstatic.com/mlb-photos/image/upload/e_background_removal,w_426,f_png/v1/people/${mlbamId}/headshot/67/current`

export const nhlMugUrl = (nhlId: string) =>
	`https://assets.nhle.com/mugs/nhl/latest/${nhlId}.png`

export const espnNflUrl = (espnId: string) =>
	`https://a.espncdn.com/i/headshots/nfl/players/full/${espnId}.png`

const nflImageUrl = (key: string, transform: string) =>
	`https://static.www.nfl.com/image/private/${transform}/league/${key}`

const bbrefHeadshotUrl = (brefId: string) =>
	`https://www.basketball-reference.com/req/202106291/images/headshots/${brefId}.jpg`

// A missing NHL mug redirects to a silhouette, so the redirect itself is the
// answer and is never followed.
async function nhlMug(url: string): Promise<Buffer | null> {
	const head = await politeFetch(url, { method: "HEAD", redirect: "manual" })
	await head.body?.cancel()
	if (head.status !== 200) return null
	return getImage(url)
}

async function nflComPhoto(key: string): Promise<Buffer | null> {
	const head = await politeFetch(nflImageUrl(key, "f_png,w_48"), {
		method: "HEAD",
	})
	await head.body?.cancel()
	if (head.status !== 200 || head.headers.get("etag") === NFL_PLACEHOLDER_ETAG)
		return null
	return getImage(nflImageUrl(key, "f_png,w_600"))
}

// Baseball-Reference keys MLB headshots by a hash only its player page
// gives away.
async function bbrefMlbPhoto(bbrefId: string): Promise<Buffer | null> {
	const res = await politeFetch(
		`https://www.baseball-reference.com/players/${bbrefId[0]}/${bbrefId}.shtml`,
	)
	if (res.status !== 200) {
		await res.body?.cancel()
		return null
	}
	const html = await res.text()
	const src = html.match(
		/<div class="media-item[^>]*>\s*<img src="([^"]+)"/,
	)?.[1]
	return src ? getImage(src) : null
}

const wikipedia = (subject: PortraitSubject): PortraitCandidate[] =>
	subject.wikipediaImage
		? [
				{
					source: "wikipedia",
					cutout: false,
					fetch: () => getImage(subject.wikipediaImage as string),
				},
			]
		: []

// The league CDN photo a player's headshotUrl or history id points at. The
// daily job and posting a Rushmore look only here, since these answer fast;
// the backfill goes on to the reference sites and Wikipedia.
export function cdnCandidates(subject: PortraitSubject): PortraitCandidate[] {
	const url = subject.headshotUrl ?? ""
	return match(subject.league)
		.with("nba", () => {
			const nbaId = url.match(NBA_HEADSHOT)?.[1]
			return nbaId
				? [
						{
							source: "nba.com",
							cutout: true,
							fetch: () =>
								getImage(
									nbaCdnUrl(nbaId),
									(body) => body.length === NBA_PLACEHOLDER_BYTES,
								),
						},
					]
				: []
		})
		.with("mlb", () => {
			const mlbamId =
				url.match(MLB_PERSON)?.[1] ??
				(subject.historyId && /^\d+$/.test(subject.historyId)
					? subject.historyId
					: null)
			return mlbamId
				? [
						{
							source: "mlbstatic",
							cutout: true,
							fetch: () => getImage(mlbCutoutUrl(mlbamId)),
						},
					]
				: []
		})
		.with("nhl", () => {
			const mugs = [
				...(url.includes("/mugs/nhl/") ? [url] : []),
				...(subject.historyId ? [nhlMugUrl(subject.historyId)] : []),
			]
			return [...new Set(mugs)].map((mug) => ({
				source: "nhl.com",
				cutout: true,
				fetch: () => nhlMug(mug),
			}))
		})
		.with("nfl", () => {
			const key = url.match(NFL_IMAGE_KEY)?.[1]
			const espn = ESPN_NFL.test(url)
				? url
				: subject.espnId
					? espnNflUrl(subject.espnId)
					: null
			return [
				...(key
					? [
							{
								source: "nfl.com",
								cutout: true,
								fetch: () => nflComPhoto(key),
							},
						]
					: []),
				...(espn
					? [{ source: "espn", cutout: true, fetch: () => getImage(espn) }]
					: []),
			]
		})
		.exhaustive()
}

// The backfill's slower sources, for a player the league CDN has no photo
// of: the reference sites' photos, then Wikipedia. Wikipedia and an MLB
// player's Baseball-Reference id need addWikipediaPhotos first.
export function fallbackCandidates(
	subject: PortraitSubject,
): PortraitCandidate[] {
	const reference = match(subject.league)
		.with("nba", () =>
			subject.historyId
				? [
						{
							source: "bref",
							cutout: false,
							fetch: () =>
								getImage(bbrefHeadshotUrl(subject.historyId as string)),
						},
					]
				: [],
		)
		.with("mlb", () =>
			subject.bbrefId
				? [
						{
							source: "bref",
							cutout: false,
							fetch: () => bbrefMlbPhoto(subject.bbrefId as string),
						},
					]
				: [],
		)
		.with("nhl", "nfl", () => [])
		.exhaustive()
	return [...reference, ...wikipedia(subject)]
}

// Every source, best first: the league CDN, then the fallbacks.
export function allCandidates(subject: PortraitSubject): PortraitCandidate[] {
	return [...cdnCandidates(subject), ...fallbackCandidates(subject)]
}

// The first real photo the candidates have.
export async function findPhoto(
	candidates: PortraitCandidate[],
): Promise<PortraitPhoto | null> {
	for (const candidate of candidates) {
		const image = await candidate.fetch()
		if (!image) continue
		const cutout = (await transparentShare(image)) >= CUTOUT_SHARE
		return { source: candidate.source, image, cutout }
	}
	return null
}
