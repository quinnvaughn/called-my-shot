import { fieldPct, quipForCall } from "@called-my-shot/scoring"
import { and, asc, count, eq, gt } from "drizzle-orm"
import type { Express, Response } from "express"
import { db } from "../db"
import {
	ballotQuestions,
	callSelections,
	calls,
	questions,
} from "../db/schema"
import { loadBallotEntry } from "../lib/ballot-entry"
import { buildGlobalLeaderboard } from "../lib/global-leaderboard"
import {
	BALLOT_SHARE_CARD_SIZE,
	buildBallotShareCard,
} from "../lib/share-cards/ballot-card"
import {
	buildCallShareCard,
	CALL_SHARE_CARD_SIZE,
} from "../lib/share-cards/call-card"
import {
	formatCallDate,
	loadCallSummaries,
} from "../lib/share-cards/call-summary"
import {
	buildStreakShareCard,
	loadStreakShareCardData,
	STREAK_SHARE_CARD_SIZE,
} from "../lib/share-cards/streak-card"
import {
	buildSweepShareCard,
	loadSweepShareCardData,
	SWEEP_SHARE_CARD_SIZE,
} from "../lib/share-cards/sweep-card"
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

	app.get(
		"/share/ballots/:ballotSlug/users/:username.png",
		async (req, res) => {
			await sendBallotShareCard(res, req.params.ballotSlug, req.params.username)
		},
	)

	app.get("/share/streaks/:username/:league/:family.png", async (req, res) => {
		await sendStreakShareCard(
			res,
			req.params.username,
			req.params.league,
			req.params.family,
		)
	})

	app.get("/share/sweeps/:username/:league/:slateKey.png", async (req, res) => {
		await sendSweepShareCard(
			res,
			req.params.username,
			req.params.league,
			req.params.slateKey,
		)
	})
}

// The og:image behind /user/:username/streaks/:league/:family. A track whose
// best run is a single call has nothing to brag about, so it 404s like a
// track that doesn't exist.
async function sendStreakShareCard(
	res: Response,
	username: string,
	leagueSlug: string,
	family: string,
) {
	const data = await loadStreakShareCardData(username, leagueSlug, family)
	if (!data) {
		res.status(404).end()
		return
	}
	const png = await renderShareImage(
		buildStreakShareCard(data),
		STREAK_SHARE_CARD_SIZE,
	)
	res.setHeader("Content-Type", "image/png")
	res.setHeader("Cache-Control", "public, max-age=300")
	res.send(png)
}

// The og:image behind /user/:username/sweeps/:league/:slateKey. 404s once an
// overturn has taken the sweep away, the same as the page's not-found state.
async function sendSweepShareCard(
	res: Response,
	username: string,
	leagueSlug: string,
	slateKey: string,
) {
	const data = await loadSweepShareCardData(username, leagueSlug, slateKey)
	if (!data) {
		res.status(404).end()
		return
	}
	const png = await renderShareImage(
		buildSweepShareCard(data),
		SWEEP_SHARE_CARD_SIZE,
	)
	res.setHeader("Content-Type", "image/png")
	res.setHeader("Cache-Control", "public, max-age=300")
	res.send(png)
}

// The og:image behind /ballots/:slug/:username. See ballot-card.ts for what
// it states.
async function sendBallotShareCard(
	res: Response,
	ballotSlug: string,
	username: string,
) {
	const [ballot, user] = await Promise.all([
		db.query.ballots.findFirst({
			where: { slug: ballotSlug, status: "published" },
			with: { league: { columns: { abbreviation: true } } },
		}),
		db.query.users.findFirst({ where: { username } }),
	])
	const entry =
		ballot && user ? await loadBallotEntry(ballot.id, user.id) : null
	if (!ballot?.league || !user || !entry) {
		res.status(404).end()
		return
	}

	const [nextLock] = await db
		.select({ locksAt: questions.locksAt })
		.from(ballotQuestions)
		.innerJoin(questions, eq(questions.id, ballotQuestions.questionId))
		.where(
			and(
				eq(ballotQuestions.ballotId, ballot.id),
				gt(questions.locksAt, new Date()),
			),
		)
		.orderBy(asc(questions.locksAt))
		.limit(1)

	const node = buildBallotShareCard({
		ballotName: ballot.name,
		leagueAbbr: ballot.league.abbreviation.toUpperCase(),
		name: user.name,
		username: user.username,
		calledCount: entry.calledCount,
		memberCount: entry.members.length,
		wins: entry.wins,
		losses: entry.losses,
		points: entry.points,
		pendingLabel: nextLock
			? `Locks ${formatCallDate(nextLock.locksAt)}`
			: "Awaiting results",
	})

	const png = await renderShareImage(node, BALLOT_SHARE_CARD_SIZE)
	res.setHeader("Content-Type", "image/png")
	res.setHeader("Cache-Control", "public, max-age=300")
	res.send(png)
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
// card. No session here, and none needed: the page it illustrates is public.
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

	// Same "Field agreed only means something for a lone selection" rule as
	// the /calls/:id page. A numeric guess is too specific for anyone to share
	// it (and has no selection, so soleOptionId is already null), and
	// player_season_award/team_season_award's several independent picks have
	// no single number. Left out of loadResolvedCallSummaries because it needs
	// its own per-question aggregate queries and only this card shows it.
	let fieldPctValue: number | null = null
	if (summary.soleOptionId) {
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
		closeness: summary.closeness,
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
		streakLength: summary.streakLength,
	})

	const png = await renderShareImage(node, CALL_SHARE_CARD_SIZE)
	res.setHeader("Content-Type", "image/png")
	res.setHeader("Cache-Control", "public, max-age=300")
	res.send(png)
}
