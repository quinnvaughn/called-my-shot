// Mount Rushmore share images. One person's Rushmore (/share/rushmore/:id)
// stands their four picks along a ridge, left to right as they arranged
// them, under the prompt and their name. A prompt's card
// (/share/rushmore-prompts/:code) shows the crowd's four: the players the
// most public answers include, with how many answers there are.
//
// Each comes in two layouts: the 1200x630 og:image a pasted link unfurls to,
// and the 1080x1350 portrait people save and post. Both print the prompt's
// short link, so someone who only ever sees the picture can type their way
// back to it.

import { promptColor } from "@called-my-shot/schemas"
import { and, asc, count, desc, eq, inArray, isNull, sql } from "drizzle-orm"
import { match } from "ts-pattern"
import { db } from "../../db"
import { players, posts, rushmorePicks } from "../../db/schema"
import { COLOR } from "../brand-palette"
import { el, image, type SatoriNode } from "../share-image"
import { imageUrl } from "../storage"
import { isUuid } from "../uuid"
import { brandWordmark } from "./brand-wordmark"
import { clamp } from "./frame"
import { fetchDataUri } from "./remote-image"
import {
	type RushmoreLayout,
	type RushmorePalette,
	rushmorePalette,
	rushmoreSkyline,
} from "./rushmore-mountain"

const SITE_HOST = "calledmyshot.com"
const FACES = 4
// Portraits come from R2 rather than a league CDN, but the card still can't
// wait on a slow one: past this the ring shows the player's initials.
const PORTRAIT_TIMEOUT_MS = 3000

const SURNAME_MAX = 14
const NAME_MAX = 22
const USERNAME_MAX = 24
const CODE_MAX = 40

export const RUSHMORE_SIZE: Record<
	RushmoreLayout,
	{ width: number; height: number }
> = {
	landscape: { width: 1200, height: 630 },
	portrait: { width: 1080, height: 1350 },
}

export type RushmoreFace = {
	name: string
	// The portrait as a data URI, or null for the player's initials.
	portrait: string | null
}

export type RushmoreCredit =
	| { kind: "author"; username: string }
	| { kind: "crowd"; answers: number }

export type RushmoreCardData = {
	title: string
	// The prompt's code. One person's Rushmore prints
	// calledmyshot.com/rushmore/{code}/{username}, the crowd's
	// calledmyshot.com/rushmore/{code}.
	code: string
	// The background: the team's color, or the prompt's own (promptColor).
	color: string
	// Left to right.
	faces: RushmoreFace[]
	credit: RushmoreCredit
}

const NAME_PARTICLES = new Set([
	"da",
	"de",
	"del",
	"della",
	"der",
	"di",
	"du",
	"la",
	"le",
	"st.",
	"van",
	"von",
])
const NAME_SUFFIXES = new Set(["jr", "jr.", "sr", "sr.", "ii", "iii", "iv"])

// "Ken Griffey Jr." is KEN + GRIFFEY, "Dick Van Dyke" is DICK + VAN DYKE:
// the surname people would say, not just the last word.
export function nameParts(name: string): { first: string; last: string } {
	const words = name.trim().split(/\s+/)
	while (
		words.length > 1 &&
		NAME_SUFFIXES.has((words[words.length - 1] ?? "").toLowerCase())
	) {
		words.pop()
	}
	let split = words.length - 1
	while (
		split > 1 &&
		NAME_PARTICLES.has((words[split - 1] ?? "").toLowerCase())
	) {
		split--
	}
	return {
		first: words.slice(0, split).join(" "),
		last: words.slice(split).join(" "),
	}
}

function credit(c: RushmoreCredit): string {
	return match(c)
		.with(
			{ kind: "author" },
			({ username }) => `by @${clamp(username, USERNAME_MAX)}`,
		)
		.with({ kind: "crowd" }, ({ answers }) =>
			answers === 1
				? "1 Rushmore"
				: `${answers.toLocaleString("en-US")} Rushmores`,
		)
		.exhaustive()
}

export function surnames(faces: RushmoreFace[]): string {
	return faces
		.map((f) => clamp(nameParts(f.name).last, SURNAME_MAX))
		.join(" · ")
}

type HeadsLayout = {
	// The top of an unraised face, its size and ring, and the gap between
	// faces. The row is centred on the card.
	top: number
	size: number
	ring: number
	gap: number
	namePx: number
	// How far each face stands above the lowest, so the four stagger a little
	// along the skyline instead of sitting in a ruler-straight row.
	raise: [number, number, number, number]
}

const HEADS: Record<RushmoreLayout, HeadsLayout> = {
	landscape: {
		top: 196,
		size: 196,
		ring: 7,
		gap: 44,
		namePx: 22,
		raise: [4, 18, 8, 22],
	},
	portrait: {
		top: 540,
		size: 222,
		ring: 8,
		gap: 26,
		namePx: 28,
		raise: [6, 24, 10, 30],
	},
}

// One face in its ring with the name under it on one line: the photo, or the
// player's initials when there's no photo. A long name steps down a size
// rather than wrapping.
function head(
	face: RushmoreFace,
	index: number,
	layout: RushmoreLayout,
	palette: RushmorePalette,
): SatoriNode {
	const h = HEADS[layout]
	const { width } = RUSHMORE_SIZE[layout]
	const rowWidth = FACES * h.size + (FACES - 1) * h.gap
	const left = (width - rowWidth) / 2 + index * (h.size + h.gap)
	const { first, last } = nameParts(face.name)
	const inner = h.size - h.ring * 2
	const name = clamp(face.name, NAME_MAX)
	const namePx = name.length > 15 ? Math.round(h.namePx * 0.84) : h.namePx
	return el(
		"div",
		{
			position: "absolute",
			left: `${left - h.gap / 2}px`,
			top: `${h.top - (h.raise[index] ?? 0)}px`,
			width: `${h.size + h.gap}px`,
			display: "flex",
			flexDirection: "column",
			alignItems: "center",
			gap: `${Math.round(h.namePx * 0.5)}px`,
		},
		[
			el(
				"div",
				{
					display: "flex",
					alignItems: "center",
					justifyContent: "center",
					width: `${h.size}px`,
					height: `${h.size}px`,
					borderRadius: "50%",
					border: `${h.ring}px solid ${palette.foreground}`,
					backgroundColor: palette.faceBacking,
					overflow: "hidden",
					boxShadow: "0 12px 30px rgba(0, 0, 0, 0.35)",
				},
				[
					face.portrait
						? image(face.portrait, inner, inner, {
								objectFit: "cover",
								objectPosition: "top",
							})
						: el(
								"span",
								{
									display: "flex",
									fontFamily: "Archivo Black",
									fontSize: `${Math.round(h.size * 0.32)}px`,
									color: palette.foreground,
								},
								`${first.charAt(0)}${last.charAt(0)}`.toUpperCase(),
							),
				],
			),
			el(
				"span",
				{
					display: "flex",
					fontFamily: "Inter",
					fontWeight: 600,
					fontSize: `${namePx}px`,
					whiteSpace: "nowrap",
					color: palette.foreground,
				},
				name,
			),
		],
	)
}

function heads(
	data: RushmoreCardData,
	layout: RushmoreLayout,
	palette: RushmorePalette,
): SatoriNode[] {
	return data.faces
		.slice(0, FACES)
		.map((face, i) => head(face, i, layout, palette))
}

function text(
	value: string,
	style: Record<string, string | number>,
): SatoriNode {
	return el("span", { display: "flex", ...style }, value)
}

// Where the picture leads, typed as printed: this person's Rushmore, or the
// prompt's page for the crowd's.
function shareAddress(data: RushmoreCardData): string {
	const prompt = `${SITE_HOST}/rushmore/${clamp(data.code, CODE_MAX)}`
	return match(data.credit)
		.with(
			{ kind: "author" },
			({ username }) => `${prompt}/${clamp(username, USERNAME_MAX)}`,
		)
		.with({ kind: "crowd" }, () => prompt)
		.exhaustive()
}

// The app's logo in the top left corner, in its own colors on the app's dark
// ground: the crosshair's orange would get lost on a red or orange team.
// Redraft images share it (redraft-card.ts).
export function cardLogo(layout: RushmoreLayout): SatoriNode {
	const landscape = layout === "landscape"
	const scale = landscape ? 1.1 : 1.5
	return el(
		"div",
		{
			position: "absolute",
			left: `${landscape ? 56 : 72}px`,
			top: `${landscape ? 30 : 64}px`,
			display: "flex",
			padding: landscape ? "10px 16px" : "14px 22px",
			borderRadius: landscape ? "10px" : "14px",
			backgroundColor: COLOR.paper,
		},
		[brandWordmark((n: number) => `${Math.round(n * scale)}px`, scale)],
	)
}

// The address the picture leads to, along the bottom.
function footer(
	data: RushmoreCardData,
	layout: RushmoreLayout,
	palette: RushmorePalette,
): SatoriNode {
	const landscape = layout === "landscape"
	const address = shareAddress(data)
	// A long prompt and username step the address down a size.
	const px = Math.round((landscape ? 20 : 28) * (address.length > 48 ? 0.8 : 1))
	return el(
		"div",
		{
			position: "absolute",
			left: `${landscape ? 56 : 72}px`,
			bottom: `${landscape ? 30 : 56}px`,
			display: "flex",
		},
		[
			text(address, {
				fontFamily: "Space Mono",
				fontSize: `${px}px`,
				color: palette.foreground,
				opacity: 0.85,
			}),
		],
	)
}

// "MOUNT RUSHMORE" over a prompt's title on every card: titles are only what
// it's of ("Boston Celtics"), and a card seen anywhere else has to say what it
// is.
function eyebrow(size: number, palette: RushmorePalette): SatoriNode {
	return text("MOUNT RUSHMORE", {
		fontFamily: "Inter",
		fontWeight: 700,
		fontSize: `${size}px`,
		letterSpacing: "0.12em",
		color: palette.foreground,
		opacity: 0.85,
	})
}

// The logo in the corner with the credit across from it, the title under
// them, the four faces standing on the skyline, the link along the bottom:
// what a pasted link unfurls to.
function landscapeCard(data: RushmoreCardData): SatoriNode {
	const { width, height } = RUSHMORE_SIZE.landscape
	const palette = rushmorePalette(data.color)
	const title = clamp(data.title, 44)
	return el(
		"div",
		{
			display: "flex",
			position: "relative",
			width: `${width}px`,
			height: `${height}px`,
			backgroundColor: palette.background,
		},
		[
			rushmoreSkyline(
				{ left: 0, top: 250, width, height: height - 250 },
				palette,
			),
			el(
				"div",
				{
					position: "absolute",
					right: "56px",
					top: "42px",
					display: "flex",
				},
				[
					text(credit(data.credit), {
						fontFamily: "Inter",
						fontWeight: 600,
						fontSize: "22px",
						whiteSpace: "nowrap",
						color: palette.foreground,
						opacity: 0.9,
					}),
				],
			),
			el(
				"div",
				{
					position: "absolute",
					left: "56px",
					top: "88px",
					width: `${width - 112}px`,
					display: "flex",
					flexDirection: "column",
					gap: "8px",
				},
				[
					eyebrow(18, palette),
					text(title, {
						fontFamily: "Archivo Black",
						fontSize: title.length > 32 ? "40px" : "50px",
						lineHeight: 1.0,
						color: palette.foreground,
					}),
				],
			),
			cardLogo("landscape"),
			...heads(data, "landscape", palette),
			footer(data, "landscape", palette),
		],
	)
}

// The same Rushmore at 4:5 for saving and posting: the logo in the corner,
// the title big under it, the faces standing on the skyline, and who made it
// with the link to it on the mountain along the bottom.
function portraitCard(data: RushmoreCardData): SatoriNode {
	const { width, height } = RUSHMORE_SIZE.portrait
	const palette = rushmorePalette(data.color)
	const title = clamp(data.title, 60)
	return el(
		"div",
		{
			display: "flex",
			position: "relative",
			width: `${width}px`,
			height: `${height}px`,
			backgroundColor: palette.background,
		},
		[
			rushmoreSkyline(
				{ left: 0, top: 620, width, height: height - 620 },
				palette,
			),
			cardLogo("portrait"),
			el(
				"div",
				{
					position: "absolute",
					left: "72px",
					top: "176px",
					width: `${width - 144}px`,
					display: "flex",
					flexDirection: "column",
					gap: "14px",
				},
				[
					eyebrow(30, palette),
					text(title, {
						fontFamily: "Archivo Black",
						fontSize: title.length > 30 ? "78px" : "96px",
						lineHeight: 1.0,
						color: palette.foreground,
					}),
				],
			),
			...heads(data, "portrait", palette),
			el(
				"div",
				{
					position: "absolute",
					left: "72px",
					bottom: "120px",
					display: "flex",
				},
				[
					text(credit(data.credit), {
						fontFamily: "Inter",
						fontWeight: 600,
						fontSize: "36px",
						color: palette.foreground,
					}),
				],
			),
			footer(data, "portrait", palette),
		],
	)
}

export function buildRushmoreCard(
	data: RushmoreCardData,
	layout: RushmoreLayout,
): SatoriNode {
	return match(layout)
		.with("landscape", () => landscapeCard(data))
		.with("portrait", () => portraitCard(data))
		.exhaustive()
}

async function facesOf(
	picks: { name: string; portraitKey: string | null }[],
): Promise<RushmoreFace[]> {
	return Promise.all(
		picks.map(async (p) => ({
			name: p.name,
			portrait: await fetchDataUri(
				imageUrl(p.portraitKey),
				PORTRAIT_TIMEOUT_MS,
			),
		})),
	)
}

// Null unless the post is a public Rushmore that's still up, on a prompt
// that's still up: a group's posts never leave the group, so they never get
// an image anyone could pass around.
export async function loadRushmoreCard(
	postId: string,
): Promise<RushmoreCardData | null> {
	if (!isUuid(postId)) return null
	const post = await db.query.posts.findFirst({
		where: {
			id: postId,
			kind: "rushmore",
			groupId: { isNull: true },
			removedAt: { isNull: true },
		},
		with: {
			author: true,
			prompt: { with: { team: true } },
			picks: { with: { player: true }, orderBy: { position: "asc" } },
		},
	})
	if (!post || post.prompt.removedAt || post.picks.length !== FACES) {
		return null
	}
	return {
		title: post.prompt.title,
		code: post.prompt.code,
		color: promptColor(post.prompt),
		faces: await facesOf(post.picks.map((p) => p.player)),
		credit: { kind: "author", username: post.author.username },
	}
}

// The crowd's Rushmore for a prompt: the four players the most public
// answers include, the most common on the left. Ties go to whoever authors
// tend to put further left. Null for a prompt that's gone or has no public
// answers yet.
export async function loadPromptCard(
	code: string,
): Promise<RushmoreCardData | null> {
	const prompt = await db.query.prompts.findFirst({
		where: { kind: "rushmore", code, removedAt: { isNull: true } },
		with: { team: true },
	})
	if (!prompt) return null
	const publicAnswer = and(
		eq(posts.promptId, prompt.id),
		isNull(posts.groupId),
		isNull(posts.removedAt),
	)
	const [answers] = await db
		.select({ n: count() })
		.from(posts)
		.where(publicAnswer)
	if (!answers?.n) return null
	const top = await db
		.select({ playerId: rushmorePicks.playerId, n: count() })
		.from(rushmorePicks)
		.innerJoin(posts, eq(posts.id, rushmorePicks.postId))
		.where(publicAnswer)
		.groupBy(rushmorePicks.playerId)
		.orderBy(
			desc(count()),
			asc(sql`avg(${rushmorePicks.position})`),
			asc(rushmorePicks.playerId),
		)
		.limit(FACES)
	const rows = await db
		.select({
			id: players.id,
			name: players.name,
			portraitKey: players.portraitKey,
		})
		.from(players)
		.where(
			inArray(
				players.id,
				top.map((t) => t.playerId),
			),
		)
	const byId = new Map(rows.map((r) => [r.id, r]))
	const picks = top.flatMap((t) => {
		const player = byId.get(t.playerId)
		return player ? [player] : []
	})
	return {
		title: prompt.title,
		code: prompt.code,
		color: promptColor(prompt),
		faces: await facesOf(picks),
		credit: { kind: "crowd", answers: answers.n },
	}
}
