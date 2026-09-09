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
	formatCallDate,
	loadCallSummaries,
} from "../lib/share-cards/call-summary"
import {
	buildUserShareCard,
	USER_SHARE_CARD_SIZE,
} from "../lib/share-cards/user-card"
import { renderShareImage } from "../lib/share-image"
import { isUuid } from "../lib/uuid"

// Plain REST, not GraphQL - these are consumed as <img src> and by the
// frontend's copy-to-clipboard flow (a plain `fetch` for the PNG bytes),
// neither of which wants to carry a GraphQL query string around. Registered
// on the Express app directly rather than through Apollo.
export function registerShareRoutes(app: Express) {
	app.get("/share/users/:username.png", async (req, res) => {
		await sendUserShareCard(res, req.params.username, null)
	})

	app.get("/share/users/:username/leagues/:league.png", async (req, res) => {
		await sendUserShareCard(res, req.params.username, req.params.league)
	})

	app.get("/share/calls/:callId.png", async (req, res) => {
		await sendCallShareCard(res, req.params.callId)
	})
}

// league is a slug ("nfl") on links built today and a uuid on ones already
// shared before the league room moved to slug urls. Both stay valid here
// rather than being redirected - this endpoint is consumed as <img src>, so
// there are no meta tags to preserve and nothing to gain from a round trip.
async function sendUserShareCard(
	res: Response,
	username: string,
	leagueRef: string | null,
) {
	const user = await db.query.users.findFirst({ where: { username } })
	if (!user) {
		res.status(404).end()
		return
	}

	let scopeTag = "ALL-TIME TRACK RECORD"
	let leagueId: string | null = null
	if (leagueRef) {
		const league = await db.query.leagues.findFirst({
			where: isUuid(leagueRef) ? { id: leagueRef } : { slug: leagueRef },
		})
		if (!league) {
			res.status(404).end()
			return
		}
		leagueId = league.id
		scopeTag = `${league.abbreviation.toUpperCase()} TRACK RECORD`
	}

	// Same board User.careerStats/User.leagues resolve from (see
	// graphql/types/user/refs.ts) - no separate query path to keep in sync with
	// those. No season scope: the card says "track record", and the scope tag
	// above already commits to all-time.
	const entries = await buildGlobalLeaderboard({ leagueId })
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

// The og:image behind /calls/:id, and the only thing that still renders this
// card. Not gated by canViewerSeePick (see lib/call-visibility.ts) - this
// route has no viewer/session at all, and the page it illustrates is
// deliberately public for the same reason: possession of the call id is the
// authorization.
//
// Deliberately NOT gated on the question being resolved either, which it used
// to be. A call made a year before it settles is exactly the one worth
// linking to, so an unresolved call renders a pending face rather than a 404.
// loadCallSummaries (not loadResolvedCallSummaries) is what allows that; the
// resolution digest still uses the resolved-only view, because an email
// announcing a result must never describe a call that has none.
async function sendCallShareCard(res: Response, callId: string) {
	// Shared with the resolution digest (lib/email-digest.ts) - same query,
	// same pick label and points, so the card and the email can never disagree
	// about a call.
	const summary = (await loadCallSummaries([callId])).get(callId)
	if (!summary) {
		res.status(404).end()
		return
	}

	// Same "one number only means something for exactly one pick" rule as
	// the frontend preview (see viewer-status-card.tsx's ShareCallSection) -
	// a numeric-guess shape and a lone selection both have one,
	// player_season_award/team_season_award's several independent picks
	// don't. Left out of loadResolvedCallSummaries because it needs its own
	// per-question aggregate queries and only this card shows it.
	let fieldPctValue: number | null = null
	if (summary.isNumeric) {
		fieldPctValue = summary.closenessFieldPct
	} else if (summary.soleOptionId) {
		const [{ n: totalCalls }] = await db
			.select({ n: count() })
			.from(calls)
			.where(eq(calls.questionId, summary.questionId))
		const [{ n: optionCallCount }] = await db
			.select({ n: count() })
			.from(callSelections)
			.innerJoin(calls, eq(calls.id, callSelections.callId))
			.where(
				and(
					eq(calls.questionId, summary.questionId),
					eq(callSelections.optionId, summary.soleOptionId),
				),
			)
		fieldPctValue = fieldPct(optionCallCount, totalCalls)
	}

	const resolved = summary.points !== null && summary.isWin !== null

	const node = buildCallShareCard({
		questionTitle: summary.questionTitle,
		leagueAbbr: summary.leagueAbbr,
		categoryLabel: summary.shapeLabel,
		name: summary.userName,
		username: summary.username,
		pickLabel: summary.pickLabel,
		calledAt: formatCallDate(summary.createdAt),
		isWin: summary.isWin,
		points: summary.points,
		fieldPct: fieldPctValue,
		conviction: summary.conviction,
		caseText: summary.caseText,
		// quipForCall only has win and loss vocabularies - there is no line for
		// a call nobody has graded, and inventing one would be the kind of
		// filler the loss quips exist to avoid.
		quip: resolved ? quipForCall(summary.callId, summary.isWin === true) : null,
		pendingLabel: resolved
			? null
			: summary.questionStatus === "open"
				? `Locks ${formatCallDate(summary.locksAt)}`
				: "Awaiting result",
	})

	const png = await renderShareImage(node, CALL_SHARE_CARD_SIZE)
	res.setHeader("Content-Type", "image/png")
	res.setHeader("Cache-Control", "public, max-age=300")
	res.send(png)
}
