import type { Express, Response } from "express"
import {
	buildBallotShareCard,
	loadBallotShareCardData,
} from "../lib/share-cards/ballot-card"
import {
	buildCallShareCard,
	loadCallShareCardData,
} from "../lib/share-cards/call-card"
import { SHARE_CARD_SIZE } from "../lib/share-cards/frame"
import {
	buildGameShareCard,
	loadGameShareCardData,
} from "../lib/share-cards/game-card"
import {
	buildGroupRecapCard,
	loadGroupRecapCardData,
} from "../lib/share-cards/group-recap-card"
import {
	buildProfileShareCard,
	loadProfileShareCardData,
} from "../lib/share-cards/profile-card"
import {
	buildReportCardShareCard,
	loadReportCardShareData,
} from "../lib/share-cards/report-card-card"
import {
	buildStreakShareCard,
	loadStreakShareCardData,
	parseStreakMode,
} from "../lib/share-cards/streak-card"
import {
	buildSweepShareCard,
	loadSweepShareCardData,
} from "../lib/share-cards/sweep-card"
import {
	type RenderOptions,
	renderShareImage,
	type SatoriNode,
} from "../lib/share-image"

// Renders one card as a PNG, or 404s when its loader finds nothing worth a
// card. Every loader returns null for an unknown subject, so a pasted link to
// one unfurls with no preview rather than an empty image.
//
// max-age only keeps a hot link from re-rendering the png on every request.
// A card whose content changes as calls settle, like a report card, relies on
// the ?v= buster on the page's og:image url to force a re-scrape.
async function serveCard<T>(
	res: Response,
	data: T | null,
	build: (data: T) => SatoriNode,
	size: RenderOptions,
) {
	if (!data) {
		res.status(404).end()
		return
	}
	const png = await renderShareImage(build(data), size)
	res.setHeader("Content-Type", "image/png")
	res.setHeader("Cache-Control", "public, max-age=300")
	res.send(png)
}

// Plain REST, not GraphQL - these are consumed as og:image urls, which
// can't carry a GraphQL query string around. Registered
// on the Express app directly rather than through Apollo.
export function registerShareRoutes(app: Express) {
	// The og:image behind /user/:username.
	app.get("/share/users/:username.png", async (req, res) => {
		await serveCard(
			res,
			await loadProfileShareCardData(req.params.username),
			buildProfileShareCard,
			SHARE_CARD_SIZE,
		)
	})

	// The og:image behind /calls/:id. No session here, and none needed: the
	// page it illustrates is public.
	app.get("/share/calls/:callId.png", async (req, res) => {
		await serveCard(
			res,
			await loadCallShareCardData(req.params.callId),
			buildCallShareCard,
			SHARE_CARD_SIZE,
		)
	})

	// The og:image behind /ballots/:slug/:username.
	app.get(
		"/share/ballots/:ballotSlug/users/:username.png",
		async (req, res) => {
			await serveCard(
				res,
				await loadBallotShareCardData(
					req.params.ballotSlug,
					req.params.username,
				),
				buildBallotShareCard,
				SHARE_CARD_SIZE,
			)
		},
	)

	// The og:image behind /games/:id/picks/:username.
	app.get("/share/games/:gameId/users/:username.png", async (req, res) => {
		await serveCard(
			res,
			await loadGameShareCardData(req.params.gameId, req.params.username),
			buildGameShareCard,
			SHARE_CARD_SIZE,
		)
	})

	// The og:image behind /user/:username/streaks/:league/:family/:mode. The
	// mode-scoped url is what the page emits: /hot and /cold are separate
	// pages, so they need separate cards. The bare one stays for links shared
	// before the split, and leads with whichever side is live. A track with
	// nothing on either side has nothing to brag about, so it 404s like a
	// track that doesn't exist.
	app.get(
		"/share/streaks/:username/:league/:family/:mode.png",
		async (req, res) => {
			await serveCard(
				res,
				await loadStreakShareCardData(
					req.params.username,
					req.params.league,
					req.params.family,
					parseStreakMode(req.params.mode),
				),
				buildStreakShareCard,
				SHARE_CARD_SIZE,
			)
		},
	)

	app.get("/share/streaks/:username/:league/:family.png", async (req, res) => {
		await serveCard(
			res,
			await loadStreakShareCardData(
				req.params.username,
				req.params.league,
				req.params.family,
				null,
			),
			buildStreakShareCard,
			SHARE_CARD_SIZE,
		)
	})

	// The og:image behind /user/:username/sweeps/:league/:slateKey. 404s once
	// an overturn has taken the sweep away, the same as the page's not-found
	// state.
	app.get("/share/sweeps/:username/:league/:slateKey.png", async (req, res) => {
		await serveCard(
			res,
			await loadSweepShareCardData(
				req.params.username,
				req.params.league,
				req.params.slateKey,
			),
			buildSweepShareCard,
			SHARE_CARD_SIZE,
		)
	})

	// The og:image behind /user/:username/report-cards/:league/:windowKey.
	// 404s for a window the caller has no calls in, so a pasted link to a week
	// they sat out unfurls with no preview rather than with an empty grade.
	app.get(
		"/share/report-cards/:username/:league/:windowKey.png",
		async (req, res) => {
			await serveCard(
				res,
				await loadReportCardShareData(
					req.params.username,
					req.params.league,
					req.params.windowKey,
				),
				buildReportCardShareCard,
				SHARE_CARD_SIZE,
			)
		},
	)

	// The og:image behind /recaps/:token. 404s for an unknown token and for a
	// group whose admins turned recap links off, so a link pasted before the
	// switch stops unfurling the recap.
	app.get("/share/recaps/:token.png", async (req, res) => {
		await serveCard(
			res,
			await loadGroupRecapCardData(req.params.token),
			buildGroupRecapCard,
			SHARE_CARD_SIZE,
		)
	})
}
