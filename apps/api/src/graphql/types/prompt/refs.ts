import { promptColor } from "@called-my-shot/schemas"
import { match } from "ts-pattern"
import { builder } from "../../builder"

// A question people answer with posts. Each kind of post answers its own kind
// of prompt, a variant over the same prompts row (the same pattern as Post):
// a RushmorePrompt is one of the app's franchise prompts ("Boston Celtics")
// or one someone started, a RedraftPrompt is a draft class. Their answers,
// the crowd's consensus and the viewer's own answer are added in
// types/post/prompt-fields.ts, next to the Post types they return.
export const PromptInterfaceRef = builder.drizzleInterface("prompts", {
	name: "Prompt",
	resolveType: (prompt) =>
		match(prompt.kind)
			.with("rushmore", () => "RushmorePrompt")
			.with("redraft", () => "RedraftPrompt")
			.exhaustive(),
	fields: (t) => ({
		id: t.exposeID("id"),
		// The prompt's address under its kind (/rushmore/{code},
		// /redraft/{code}), printed on share images.
		code: t.exposeString("code"),
		title: t.exposeString("title"),
		createdAt: t.field({ type: "DateTime", resolve: (p) => p.createdAt }),
		// Null on a Rushmore prompt open to every sport.
		league: t.relation("league", { nullable: true }),
		// What its answers are drawn in: the team's color, else the one its
		// creator chose, else the one its title gives.
		color: t.string({
			select: {
				columns: { title: true, color: true },
				with: { team: { columns: { color: true } } },
			},
			resolve: (p) => promptColor(p),
		}),
		// Null on the app's own prompts.
		creator: t.relation("creator", { nullable: true }),
		viewerIsCreator: t.boolean({
			resolve: (p, _args, ctx) =>
				ctx.user !== null && ctx.user.id === p.creatorId,
		}),
	}),
})

export const RushmorePromptRef = builder.drizzleObject("prompts", {
	variant: "RushmorePrompt",
	interfaces: [PromptInterfaceRef],
	fields: (t) => ({
		// Set on a franchise prompt and on anyone's prompt narrowed to one team.
		// Picks come from that team's all-time players; otherwise from anyone
		// who played in the league, or in any league without one.
		team: t.relation("team", { nullable: true }),
		// The league's position codes (RUSHMORE_POSITIONS) picks have to have
		// played at least one of. Empty when it's any position.
		positions: t.exposeStringList("positions"),
		// Calendar years a pick has to have played in at least one of. Either
		// end can be open.
		fromYear: t.exposeInt("fromYear", { nullable: true }),
		toYear: t.exposeInt("toYear", { nullable: true }),
		isFranchise: t.boolean({
			resolve: (p) => p.creatorId === null && p.teamId !== null,
		}),
	}),
})

// A draft class, "2003 NBA Draft". Its slots, lengths and the crowd's
// redraft are in types/post/redraft-fields.ts.
export const RedraftPromptRef = builder.drizzleObject("prompts", {
	variant: "RedraftPrompt",
	interfaces: [PromptInterfaceRef],
	fields: (t) => ({
		draftYear: t.int({
			resolve: (p) => {
				if (p.draftYear === null) throw new Error("Redraft prompt has no year")
				return p.draftYear
			},
		}),
	}),
})
