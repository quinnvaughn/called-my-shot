// Redraft share images. One person's redraft (/share/redraft/:id) lists
// their picks slot by slot under the class's title and their name: the
// slot's number, the logo of the team that held it, the player and how far
// they moved from the real draft (a green ▲3, a red ▼1, a grey "Same"). A class's card (/share/redraft-prompts/:code) is
// the crowd's redraft, with how many redrafts there are.
//
// Like a Rushmore, each comes as the 1200x630 og:image and the 1080x1350
// portrait people save and post, and both print the short link back. Up to
// ten picks get a full row with a portrait; a longer redraft (a whole first
// round) packs into two columns of names so every pick still fits.

import {
	promptColor,
	REDRAFT_DOWN_COLOR,
	REDRAFT_UP_COLOR,
	redraftMove,
} from "@called-my-shot/schemas"
import { inArray } from "drizzle-orm"
import { match } from "ts-pattern"
import { db } from "../../db"
import { players, teams } from "../../db/schema"
import { COLOR } from "../brand-palette"
import { classLengths, draftSlots, originalPicks } from "../drafts/class"
import { crowdRedraft, redraftConsensus } from "../posts/redraft-consensus"
import { el, image, type SatoriNode, svgEl } from "../share-image"
import { imageUrl } from "../storage"
import { isUuid } from "../uuid"
import { clamp } from "./frame"
import { fetchDataUri } from "./remote-image"
import { cardLogo, nameParts } from "./rushmore-card"
import {
	type RushmoreLayout,
	type RushmorePalette,
	rushmorePalette,
} from "./rushmore-mountain"
import { logoDataUri } from "./team-logo"

const SITE_HOST = "calledmyshot.com"
const PORTRAIT_TIMEOUT_MS = 3000

const NAME_MAX = 22
const SHORT_NAME_MAX = 18
const USERNAME_MAX = 24
const CODE_MAX = 40
const TITLE_MAX = 30

// The most picks that get a full row with a portrait. Past it, two columns.
const FULL_ROWS = 10

export const REDRAFT_SIZE: Record<
	RushmoreLayout,
	{ width: number; height: number }
> = {
	landscape: { width: 1200, height: 630 },
	portrait: { width: 1080, height: 1350 },
}

export type RedraftRow = {
	slot: number
	name: string
	// Data URIs, or null for initials and a blank logo spot.
	portrait: string | null
	teamLogo: string | null
	// Where he really went. Null when he came in undrafted.
	original: number | null
}

export type RedraftCredit =
	| { kind: "author"; username: string }
	| { kind: "crowd"; answers: number }

export type RedraftCardData = {
	title: string
	// The class's code: calledmyshot.com/redraft/{code}[/{username}].
	code: string
	color: string
	rows: RedraftRow[]
	credit: RedraftCredit
}

function text(
	value: string,
	style: Record<string, string | number>,
): SatoriNode {
	return el("span", { display: "flex", whiteSpace: "nowrap", ...style }, value)
}

function credit(c: RedraftCredit): string {
	return match(c)
		.with(
			{ kind: "author" },
			({ username }) => `by @${clamp(username, USERNAME_MAX)}`,
		)
		.with({ kind: "crowd" }, ({ answers }) =>
			answers === 1
				? "1 redraft"
				: `${answers.toLocaleString("en-US")} redrafts`,
		)
		.exhaustive()
}

function shareAddress(data: RedraftCardData): string {
	const prompt = `${SITE_HOST}/redraft/${clamp(data.code, CODE_MAX)}`
	return match(data.credit)
		.with(
			{ kind: "author" },
			({ username }) => `${prompt}/${clamp(username, USERNAME_MAX)}`,
		)
		.with({ kind: "crowd" }, () => prompt)
		.exhaustive()
}

// A filled triangle, drawn rather than typed: the card's fonts have no
// glyph for one.
function caret(direction: "up" | "down", size: number, color: string) {
	return svgEl("svg", { width: size, height: size, viewBox: "0 0 10 10" }, [
		svgEl("polygon", {
			points: direction === "up" ? "5,1 10,9 0,9" : "0,1 10,1 5,9",
			fill: color,
		}),
	])
}

// How far a pick moved from the real draft, as a pill on the app's dark
// ground so it reads on any team's color, the same as the post page's.
export function movePill(
	slot: number,
	original: number | null,
	px: number,
): SatoriNode {
	const move = redraftMove(slot, original)
	const color = match(move.kind)
		.with("up", "undrafted", () => REDRAFT_UP_COLOR)
		.with("down", () => REDRAFT_DOWN_COLOR)
		.with("same", () => COLOR.dim)
		.exhaustive()
	const content = match(move)
		.with({ kind: "up" }, { kind: "down" }, ({ kind, by }) => [
			caret(kind, Math.round(px * 0.8), color),
			text(String(by), {}),
		])
		.with({ kind: "same" }, () => [text("Same", {})])
		.with({ kind: "undrafted" }, () => [text("Undrafted", {})])
		.exhaustive()
	return el(
		"div",
		{
			display: "flex",
			alignItems: "center",
			justifyContent: "center",
			flexShrink: 0,
			gap: `${Math.round(px * 0.2)}px`,
			minWidth: `${Math.round(px * 2.6)}px`,
			height: `${Math.round(px * 1.6)}px`,
			padding: `${Math.round(px * 0.2)}px ${Math.round(px * 0.5)}px`,
			borderRadius: `${px}px`,
			backgroundColor: COLOR.paper,
			fontFamily: "Inter",
			fontWeight: 700,
			fontSize: `${px}px`,
			color,
		},
		content,
	)
}

// "Sebastian Janikowski" as "S. Janikowski", for the two-column rows.
export function shortName(name: string): string {
	const { first, last } = nameParts(name)
	return clamp(first ? `${first.charAt(0)}. ${last}` : last, SHORT_NAME_MAX)
}

type RowSize = {
	height: number
	gap: number
	padding: number
	slotPx: number
	slotWidth: number
	logo: number
	// 0 for no portrait.
	face: number
	namePx: number
	wasPx: number
}

function teamLogo(uri: string | null, size: number): SatoriNode {
	return el(
		"div",
		{
			display: "flex",
			width: `${size}px`,
			height: `${size}px`,
			flexShrink: 0,
			alignItems: "center",
			justifyContent: "center",
		},
		uri ? [image(uri, size, size, { objectFit: "contain" })] : [],
	)
}

function face(
	row: RedraftRow,
	size: number,
	palette: RushmorePalette,
): SatoriNode {
	const { first, last } = nameParts(row.name)
	const ring = Math.max(2, Math.round(size / 22))
	const inner = size - ring * 2
	return el(
		"div",
		{
			display: "flex",
			flexShrink: 0,
			alignItems: "center",
			justifyContent: "center",
			width: `${size}px`,
			height: `${size}px`,
			borderRadius: "50%",
			border: `${ring}px solid ${palette.foreground}`,
			backgroundColor: palette.faceBacking,
			overflow: "hidden",
		},
		[
			row.portrait
				? image(row.portrait, inner, inner, {
						objectFit: "cover",
						objectPosition: "top",
					})
				: text(`${first.charAt(0)}${last.charAt(0)}`.toUpperCase(), {
						fontFamily: "Archivo Black",
						fontSize: `${Math.round(size * 0.34)}px`,
						color: palette.foreground,
					}),
		],
	)
}

function row(
	r: RedraftRow,
	size: RowSize,
	palette: RushmorePalette,
	short: boolean,
): SatoriNode {
	return el(
		"div",
		{
			display: "flex",
			alignItems: "center",
			height: `${size.height}px`,
			gap: `${size.gap}px`,
			padding: `0 ${size.padding}px`,
			borderRadius: `${Math.round(size.height * 0.2)}px`,
			backgroundColor: palette.faceBacking,
		},
		[
			text(String(r.slot), {
				width: `${size.slotWidth}px`,
				flexShrink: 0,
				justifyContent: "flex-end",
				fontFamily: "Archivo Black",
				fontSize: `${size.slotPx}px`,
				color: palette.foreground,
			}),
			teamLogo(r.teamLogo, size.logo),
			...(size.face > 0 ? [face(r, size.face, palette)] : []),
			text(short ? shortName(r.name) : clamp(r.name, NAME_MAX), {
				flexGrow: 1,
				fontFamily: "Inter",
				fontWeight: 600,
				fontSize: `${size.namePx}px`,
				color: palette.foreground,
				overflow: "hidden",
			}),
			movePill(r.slot, r.original, size.wasPx),
		],
	)
}

// The rows inside a box: one column of full rows when they fit, else two
// columns of short ones, filled top to bottom then left to right.
function rows(
	box: { left: number; top: number; width: number; height: number },
	layout: RushmoreLayout,
	palette: RushmorePalette,
	shown: RedraftRow[],
): SatoriNode {
	const gap = layout === "portrait" ? 10 : 8
	const twoColumns = shown.length > (layout === "portrait" ? FULL_ROWS : 5)
	const perColumn = twoColumns ? Math.ceil(shown.length / 2) : shown.length
	// Rows grow to fill the box (a Top 5 stands tall on the portrait), with
	// everything but the height capped so a name still fits: beside the face
	// on a full row, in half the width on a two-column one.
	const height = Math.min(
		layout === "landscape" ? 68 : twoColumns ? 100 : 136,
		Math.floor((box.height - gap * (perColumn - 1)) / Math.max(perColumn, 1)),
	)
	const portraits = layout === "landscape" || !twoColumns
	const compact = twoColumns && layout === "portrait"
	const scaled = (ratio: number, max: number) =>
		Math.min(Math.round(height * ratio), max)
	const size: RowSize = {
		height,
		gap: scaled(0.2, compact ? 10 : 20),
		padding: scaled(0.24, compact ? 16 : 28),
		slotPx: scaled(0.42, compact ? 32 : 48),
		slotWidth: scaled(0.7, compact ? 44 : 72),
		logo: scaled(0.56, compact ? 36 : 64),
		face: portraits ? Math.min(height - 12, 112) : 0,
		namePx: scaled(compact ? 0.38 : 0.42, compact ? 26 : 38),
		wasPx: scaled(0.3, compact ? 20 : 28),
	}
	const columns = twoColumns
		? [shown.slice(0, perColumn), shown.slice(perColumn)]
		: [shown]
	return el(
		"div",
		{
			position: "absolute",
			left: `${box.left}px`,
			top: `${box.top}px`,
			width: `${box.width}px`,
			display: "flex",
			gap: "24px",
		},
		columns.map((column) =>
			el(
				"div",
				{
					display: "flex",
					flexDirection: "column",
					flexGrow: 1,
					flexBasis: 0,
					gap: `${gap}px`,
				},
				column.map((r) => row(r, size, palette, twoColumns)),
			),
		),
	)
}

function heading(
	data: RedraftCardData,
	layout: RushmoreLayout,
	palette: RushmorePalette,
): SatoriNode {
	const portrait = layout === "portrait"
	const title = clamp(data.title, TITLE_MAX)
	return el(
		"div",
		{
			position: "absolute",
			left: `${portrait ? 72 : 56}px`,
			top: `${portrait ? 176 : 88}px`,
			display: "flex",
			flexDirection: "column",
			gap: portrait ? "12px" : "6px",
		},
		[
			text("REDRAFT", {
				fontFamily: "Inter",
				fontWeight: 700,
				fontSize: portrait ? "30px" : "18px",
				letterSpacing: "0.12em",
				color: palette.foreground,
				opacity: 0.85,
			}),
			text(title, {
				fontFamily: "Archivo Black",
				fontSize: portrait ? "84px" : "46px",
				lineHeight: 1.0,
				color: palette.foreground,
			}),
			...(portrait
				? [
						text(credit(data.credit), {
							fontFamily: "Inter",
							fontWeight: 600,
							fontSize: "34px",
							color: palette.foreground,
						}),
					]
				: []),
		],
	)
}

function footer(
	data: RedraftCardData,
	layout: RushmoreLayout,
	palette: RushmorePalette,
	more: number,
): SatoriNode {
	const portrait = layout === "portrait"
	const address = shareAddress(data)
	const px = Math.round((portrait ? 28 : 20) * (address.length > 48 ? 0.8 : 1))
	return el(
		"div",
		{
			position: "absolute",
			left: `${portrait ? 72 : 56}px`,
			right: `${portrait ? 72 : 56}px`,
			bottom: `${portrait ? 56 : 26}px`,
			display: "flex",
			justifyContent: "space-between",
		},
		[
			text(address, {
				fontFamily: "Space Mono",
				fontSize: `${px}px`,
				color: palette.foreground,
				opacity: 0.85,
			}),
			...(more > 0
				? [
						text(`+${more} more`, {
							fontFamily: "Inter",
							fontWeight: 600,
							fontSize: `${px}px`,
							color: palette.foreground,
						}),
					]
				: []),
		],
	)
}

// The logo, the class and who made it across the top, then up to ten picks
// in two columns of five, then the link.
function landscapeCard(data: RedraftCardData): SatoriNode {
	const { width, height } = REDRAFT_SIZE.landscape
	const palette = rushmorePalette(data.color)
	const shown = data.rows.slice(0, FULL_ROWS)
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
			cardLogo("landscape"),
			el(
				"div",
				{ position: "absolute", right: "56px", top: "42px", display: "flex" },
				[
					text(credit(data.credit), {
						fontFamily: "Inter",
						fontWeight: 600,
						fontSize: "22px",
						color: palette.foreground,
						opacity: 0.9,
					}),
				],
			),
			heading(data, "landscape", palette),
			rows(
				{ left: 56, top: 186, width: width - 112, height: 380 },
				"landscape",
				palette,
				shown,
			),
			footer(data, "landscape", palette, data.rows.length - shown.length),
		],
	)
}

// The whole redraft at 4:5 for saving and posting: every pick, a first round
// included.
function portraitCard(data: RedraftCardData): SatoriNode {
	const { width, height } = REDRAFT_SIZE.portrait
	const palette = rushmorePalette(data.color)
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
			cardLogo("portrait"),
			heading(data, "portrait", palette),
			rows(
				{ left: 72, top: 420, width: width - 144, height: 820 },
				"portrait",
				palette,
				data.rows,
			),
			footer(data, "portrait", palette, 0),
		],
	)
}

export function buildRedraftCard(
	data: RedraftCardData,
	layout: RushmoreLayout,
): SatoriNode {
	return match(layout)
		.with("landscape", () => landscapeCard(data))
		.with("portrait", () => portraitCard(data))
		.exhaustive()
}

// Each pick's row: the slot's team logo and, for the first ten, the
// player's portrait. Logos are fetched once per team.
async function rowsOf(
	prompt: { leagueId: string | null; draftYear: number | null },
	picks: { slot: number; playerId: string }[],
): Promise<RedraftRow[]> {
	if (!prompt.leagueId || picks.length === 0) return []
	const [slots, people, originals] = await Promise.all([
		draftSlots(prompt, Math.max(...picks.map((p) => p.slot))),
		db
			.select({
				id: players.id,
				name: players.name,
				portraitKey: players.portraitKey,
			})
			.from(players)
			.where(
				inArray(
					players.id,
					picks.map((p) => p.playerId),
				),
			),
		originalPicks(
			db,
			prompt.leagueId,
			picks.map((p) => p.playerId),
		),
	])
	const teamIds = [
		...new Set(slots.flatMap((slot) => (slot.teamId ? [slot.teamId] : []))),
	]
	const teamRows = teamIds.length
		? await db
				.select({ id: teams.id, logoUrl: teams.logoUrl })
				.from(teams)
				.where(inArray(teams.id, teamIds))
		: []
	const logos = new Map(
		await Promise.all(
			teamRows.map(
				async (team) => [team.id, await logoDataUri(team.logoUrl)] as const,
			),
		),
	)
	const byId = new Map(people.map((p) => [p.id, p]))
	return Promise.all(
		picks.map(async (pick, i) => {
			const player = byId.get(pick.playerId)
			const teamId = slots[pick.slot - 1]?.teamId
			return {
				slot: pick.slot,
				name: player?.name ?? "",
				portrait:
					i < FULL_ROWS && player
						? await fetchDataUri(
								imageUrl(player.portraitKey),
								PORTRAIT_TIMEOUT_MS,
							)
						: null,
				teamLogo: teamId ? (logos.get(teamId) ?? null) : null,
				original: originals.get(pick.playerId) ?? null,
			}
		}),
	)
}

// Null unless the post is a public redraft that's still up, of a class
// that's still up: a group's posts never leave the group.
export async function loadRedraftCard(
	postId: string,
): Promise<RedraftCardData | null> {
	if (!isUuid(postId)) return null
	const post = await db.query.posts.findFirst({
		where: {
			id: postId,
			kind: "redraft",
			groupId: { isNull: true },
			removedAt: { isNull: true },
		},
		with: {
			author: true,
			prompt: { with: { team: true } },
			redraftPicks: { orderBy: { slot: "asc" } },
		},
	})
	if (!post || post.prompt.removedAt || post.redraftPicks.length === 0) {
		return null
	}
	return {
		title: post.prompt.title,
		code: post.prompt.code,
		color: promptColor(post.prompt),
		rows: await rowsOf(post.prompt, post.redraftPicks),
		credit: { kind: "author", username: post.author.username },
	}
}

// The crowd's redraft of a class at its default length. Null for a class
// that's gone or has no public redrafts yet.
export async function loadRedraftPromptCard(
	code: string,
): Promise<RedraftCardData | null> {
	const prompt = await db.query.prompts.findFirst({
		where: { kind: "redraft", code, removedAt: { isNull: true } },
		with: { team: true },
	})
	if (!prompt) return null
	const consensus = (await redraftConsensus([prompt.id])).get(prompt.id)
	if (!consensus?.answerCount) return null
	const lengths = await classLengths(prompt)
	const length =
		lengths.find((l) => l.isDefault)?.count ?? lengths.at(-1)?.count ?? 0
	return {
		title: prompt.title,
		code: prompt.code,
		color: promptColor(prompt),
		rows: await rowsOf(prompt, crowdRedraft(consensus, length)),
		credit: { kind: "crowd", answers: consensus.answerCount },
	}
}
