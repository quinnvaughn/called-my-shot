import type { CreatePromptInput } from "@called-my-shot/schemas"
import type { Prompt } from "../../../db/schema"
import { requireUser } from "../../../lib/auth"
import { AuthenticationError, NotFoundError } from "../../../lib/errors"
import { createPrompt } from "../../../lib/prompts/create-prompt"
import { builder } from "../../builder"
import { RushmorePromptRef } from "./refs"

const RushmorePromptPayload = builder
	.objectRef<{ prompt: Prompt }>("RushmorePromptPayload")
	.implement({
		fields: (t) => ({
			prompt: t.field({ type: RushmorePromptRef, resolve: (p) => p.prompt }),
		}),
	})

const CreateRushmorePromptInput = builder.inputType(
	"CreateRushmorePromptInput",
	{
		fields: (t) => ({
			title: t.string({ required: true }),
			// Narrows the picks to one league's players. Left out, anyone from
			// any league can be picked.
			leagueId: t.id({ required: false }),
			// Narrows the picks to one franchise's players. Its league is the
			// prompt's.
			teamId: t.id({ required: false }),
			// One of PROMPT_COLORS. Left out, the title picks one; ignored with a
			// team.
			color: t.string({ required: false }),
			// The league's position codes; needs a league.
			positions: t.stringList({ required: false }),
			// Played-between calendar years, either end open.
			fromYear: t.int({ required: false }),
			toYear: t.int({ required: false }),
		}),
	},
)

builder.mutationFields((t) => ({
	// Starts a prompt for anyone to answer. The composer shows similar ones
	// first (searchPrompts), so people join an existing crowd rather than
	// start a second.
	createRushmorePrompt: t.field({
		type: RushmorePromptPayload,
		errors: {
			types: [AuthenticationError, NotFoundError],
			directResult: true,
			union: { name: "CreateRushmorePromptResult" },
		},
		args: {
			input: t.arg({ type: CreateRushmorePromptInput, required: true }),
		},
		resolve: async (_root, args, ctx) => {
			const user = requireUser(ctx)
			const prompt = await createPrompt(user, {
				title: args.input.title,
				leagueId: args.input.leagueId ? String(args.input.leagueId) : null,
				teamId: args.input.teamId ? String(args.input.teamId) : null,
				positions: args.input.positions ?? [],
				color: args.input.color as CreatePromptInput["color"],
				fromYear: args.input.fromYear ?? null,
				toYear: args.input.toYear ?? null,
			})
			return { prompt }
		},
	}),
}))
