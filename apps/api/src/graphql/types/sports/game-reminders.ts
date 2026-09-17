import { db } from "../../../db"
import { requireUser } from "../../../lib/auth"
import {
	AuthenticationError,
	NotFoundError,
	ValidationError,
} from "../../../lib/errors"
import {
	removeGameReminder,
	setGameReminder,
} from "../../../lib/game-reminders"
import { builder } from "../../builder"
import { GameRef } from "./game"

async function findGame(gameId: string) {
	const game = await db.query.games.findFirst({ where: { id: gameId } })
	if (!game) throw new NotFoundError("Game not found")
	return game
}

// Both return the game so the client can re-read viewerHasReminder off the
// result rather than refetching the page.
builder.mutationFields((t) => ({
	setGameReminder: t.field({
		type: GameRef,
		errors: {
			types: [AuthenticationError, NotFoundError, ValidationError],
			directResult: true,
			union: { name: "SetGameReminderResult" },
		},
		args: { gameId: t.arg.id({ required: true }) },
		resolve: async (_root, args, ctx) => {
			const user = requireUser(ctx)
			const game = await findGame(String(args.gameId))
			// A game starting inside the lead window is still allowed - the next
			// drain sends it straight away.
			if (game.status !== "scheduled" || game.startsAt <= new Date()) {
				throw ValidationError.field(null, "This game has already started.")
			}
			await setGameReminder(user.id, game.id)
			return game
		},
	}),

	removeGameReminder: t.field({
		type: GameRef,
		errors: {
			types: [AuthenticationError, NotFoundError],
			directResult: true,
			union: { name: "RemoveGameReminderResult" },
		},
		args: { gameId: t.arg.id({ required: true }) },
		resolve: async (_root, args, ctx) => {
			const user = requireUser(ctx)
			const game = await findGame(String(args.gameId))
			await removeGameReminder(user.id, game.id)
			return game
		},
	}),
}))
