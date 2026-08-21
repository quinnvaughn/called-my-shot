import { fieldPct, quipForCall } from "@called-my-shot/scoring"
import { and, count, eq } from "drizzle-orm"
import type { Express, Response } from "express"
import { db } from "../db"
import { callSelections, calls } from "../db/schema"
import { buildGlobalLeaderboard } from "../lib/global-leaderboard"
import {
	buildCallShareCard,
	CALL_SHARE_CARD_SIZE,
} from "../lib/share-cards/call-card"
import {
	buildUserShareCard,
	USER_SHARE_CARD_SIZE,
} from "../lib/share-cards/user-card"
import { renderShareImage } from "../lib/share-image"

// Plain REST, not GraphQL - these are consumed as <img src> and by the
// frontend's copy-to-clipboard flow (a plain `fetch` for the PNG bytes),
// neither of which wants to carry a GraphQL query string around. Registered
// on the Express app directly rather than through Apollo.
export function registerShareRoutes(app: Express) {
	app.get("/share/users/:username.png", async (req, res) => {
		await sendUserShareCard(res, req.params.username, null)
	})

	app.get("/share/users/:username/leagues/:leagueId.png", async (req, res) => {
		await sendUserShareCard(res, req.params.username, req.params.leagueId)
	})

	app.get("/share/calls/:callId.png", async (req, res) => {
		await sendCallShareCard(res, req.params.callId)
	})
}

const CATEGORY_LABEL: Record<string, string> = {
	season_awards: "Season Awards",
	game_stats: "Game Stats",
	player_stats: "Player Stats",
	other: "Other",
}

// Mirrors lib/call-summary.ts's pickSummary on the frontend, against this
// route's own DB-shaped call rather than the GraphQL Call type - no shared
// module between the two given the enum casing they each work off already
// differs (GraphQL's SCREAMING_SNAKE vs. this table's snake_case), same
// reasoning viewer-status-card.tsx's BASE_POINTS_BY_GQL_TYPE bridge already
// documents.
function buildPickLabel(call: {
	guessValue: number | null
	question: { type: string; ouLine: number | null }
	selections: { option: { label: string; isCorrect: boolean | null } }[]
}): string {
	if (call.question.type === "numeric_guess") {
		return call.guessValue !== null ? String(call.guessValue) : "—"
	}
	if (call.question.type === "multi_select") {
		if (call.selections.length === 0) return "—"
		const hits = call.selections.filter((s) => s.option.isCorrect).length
		return `${hits} of ${call.selections.length} hit`
	}
	const selection = call.selections[0]
	if (!selection) return "—"
	if (call.question.type === "over_under" && call.question.ouLine !== null) {
		return `${selection.option.label} ${call.question.ouLine}`
	}
	return selection.option.label
}

async function sendUserShareCard(
	res: Response,
	username: string,
	leagueId: string | null,
) {
	const user = await db.query.users.findFirst({ where: { username } })
	if (!user) {
		res.status(404).end()
		return
	}

	let scopeTag = "ALL-TIME TRACK RECORD"
	if (leagueId) {
		const league = await db.query.leagues.findFirst({
			where: { id: leagueId },
		})
		if (!league) {
			res.status(404).end()
			return
		}
		scopeTag = `${league.abbreviation.toUpperCase()} TRACK RECORD`
	}

	// Same board Query.leaderboard/User.careerStats/User.leagues resolve from
	// (see graphql/types/leaderboard.ts and user.ts) - no separate query path
	// to keep in sync with those.
	const entries = await buildGlobalLeaderboard(leagueId)
	const entry = entries.find((e) => e.user.id === user.id)
	// No calls in this scope yet - nothing shareable, same as the frontend
	// not offering a league accordion/share button for an empty scope.
	if (!entry) {
		res.status(404).end()
		return
	}

	const node = buildUserShareCard({
		name: user.name,
		username: user.username,
		memberSince: user.createdAt.toISOString(),
		scopeTag,
		rank: entry.rank,
		totalPoints: entry.totalPoints,
		accuracy: entry.accuracy,
		callCount: entry.callCount,
	})

	const png = await renderShareImage(node, USER_SHARE_CARD_SIZE)
	res.setHeader("Content-Type", "image/png")
	res.setHeader("Cache-Control", "public, max-age=300")
	res.send(png)
}

// Not gated by canViewerSeePick (see lib/call-visibility.ts) - this route
// has no viewer/session at all, and by the time it's reachable the caller
// has already clicked "Share this call" on their own resolved pick, so
// there's no anti-copying concern left to protect (that rule only exists
// while a question is still accepting calls - see that file's own comment).
// Gated instead on the question actually being resolved: sharing a call with
// no outcome yet isn't a thing the frontend ever offers (the share button
// only renders once win/loss is known), so this mirrors that rather than
// rendering a card with nothing to report.
async function sendCallShareCard(res: Response, callId: string) {
	const call = await db.query.calls.findFirst({
		where: { id: callId },
		with: {
			user: { columns: { name: true, username: true } },
			question: {
				columns: {
					id: true,
					title: true,
					type: true,
					status: true,
					category: true,
					ouLine: true,
				},
				with: { league: { columns: { abbreviation: true } } },
			},
			selections: {
				with: { option: { columns: { label: true, isCorrect: true } } },
			},
		},
	})
	if (
		!call?.user ||
		!call?.question?.league ||
		call.question.status !== "resolved"
	) {
		res.status(404).end()
		return
	}

	// selections[].option is typed nullable purely because drizzle types
	// every `one` relation that way regardless of the FK's own nullability
	// (optionId is NOT NULL) - same non-issue documented at length in
	// graphql/types/question.ts's resolveQuestionInternal. Narrowed once,
	// here, rather than re-guarded at every later read.
	const selections = call.selections.filter(
		(s): s is typeof s & { option: NonNullable<(typeof s)["option"]> } =>
			s.option !== null,
	)

	const isNumeric = call.question.type === "numeric_guess"
	const totalPoints = isNumeric
		? call.resultPoints
		: selections.length > 0 && selections.every((s) => s.resultPoints !== null)
			? selections.reduce((sum, s) => sum + (s.resultPoints ?? 0), 0)
			: null
	// Same "nothing to report yet" gate as above, per-call rather than
	// per-question - a question can resolve while a specific call still has
	// no final points (shouldn't happen once resolved, but nothing here
	// should render a share card with a missing result either way).
	if (totalPoints === null) {
		res.status(404).end()
		return
	}
	const isWin = totalPoints >= 0

	const conviction = isNumeric
		? (call.conviction ?? 0)
		: selections.length > 0
			? Math.round(
					selections.reduce((sum, s) => sum + s.conviction, 0) /
						selections.length,
				)
			: 0

	// Same "one number only means something for exactly one pick" rule as
	// the frontend preview (see viewer-status-card.tsx's ShareCallSection) -
	// numeric_guess and a lone selection both have one, multi_select's
	// several independent picks don't.
	let fieldPctValue: number | null = null
	if (isNumeric) {
		fieldPctValue = call.closenessFieldPct
	} else if (selections.length === 1) {
		const [{ n: totalCalls }] = await db
			.select({ n: count() })
			.from(calls)
			.where(eq(calls.questionId, call.question.id))
		const [{ n: optionCallCount }] = await db
			.select({ n: count() })
			.from(callSelections)
			.innerJoin(calls, eq(calls.id, callSelections.callId))
			.where(
				and(
					eq(calls.questionId, call.question.id),
					eq(callSelections.optionId, selections[0].optionId),
				),
			)
		fieldPctValue = fieldPct(optionCallCount, totalCalls)
	}

	const node = buildCallShareCard({
		questionTitle: call.question.title,
		leagueAbbr: call.question.league.abbreviation.toUpperCase(),
		categoryLabel: CATEGORY_LABEL[call.question.category] ?? "Other",
		name: call.user.name,
		username: call.user.username,
		pickLabel: buildPickLabel({
			guessValue: call.guessValue,
			question: { type: call.question.type, ouLine: call.question.ouLine },
			selections,
		}),
		isWin,
		points: totalPoints,
		fieldPct: fieldPctValue,
		conviction,
		caseText: call.caseText,
		quip: quipForCall(call.id, isWin),
	})

	const png = await renderShareImage(node, CALL_SHARE_CARD_SIZE)
	res.setHeader("Content-Type", "image/png")
	res.setHeader("Cache-Control", "public, max-age=300")
	res.send(png)
}
