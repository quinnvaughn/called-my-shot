import type { Express, Response } from "express"
import { db } from "../db"
import { buildGlobalLeaderboard } from "../lib/global-leaderboard"
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
