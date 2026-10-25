import { promptColor } from "@called-my-shot/schemas"
import { builder } from "../../builder"

// A question people answer with a Rushmore: one of the app's franchise
// prompts ("Boston Celtics") or one someone started. Its answers,
// the crowd's consensus and the viewer's own answer are added in
// types/post/prompt-fields.ts, next to the Post types they return.
export const RushmorePromptRef = builder.drizzleObject("prompts", {
	name: "RushmorePrompt",
	fields: (t) => ({
		id: t.exposeID("id"),
		// The prompt's address, /rushmore/{code}, printed on share images.
		code: t.exposeString("code"),
		title: t.exposeString("title"),
		createdAt: t.field({ type: "DateTime", resolve: (p) => p.createdAt }),
		// Null on a prompt open to every sport.
		league: t.relation("league", { nullable: true }),
		// Set on a franchise prompt and on anyone's prompt narrowed to one team.
		// Picks come from that team's all-time players; otherwise from anyone
		// who played in the league, or in any league without one.
		team: t.relation("team", { nullable: true }),
		// What its Rushmores are drawn in: the team's color, else the one its
		// creator chose, else the one its title gives.
		color: t.string({
			select: {
				columns: { title: true, color: true },
				with: { team: { columns: { color: true } } },
			},
			resolve: (p) => promptColor(p),
		}),
		// The league's position codes (RUSHMORE_POSITIONS) picks have to have
		// played at least one of. Empty when it's any position.
		positions: t.exposeStringList("positions"),
		// Calendar years a pick has to have played in at least one of. Either
		// end can be open.
		fromYear: t.exposeInt("fromYear", { nullable: true }),
		toYear: t.exposeInt("toYear", { nullable: true }),
		// Null on the app's own franchise prompts.
		creator: t.relation("creator", { nullable: true }),
		isFranchise: t.boolean({
			resolve: (p) => p.creatorId === null && p.teamId !== null,
		}),
		viewerIsCreator: t.boolean({
			resolve: (p, _args, ctx) =>
				ctx.user !== null && ctx.user.id === p.creatorId,
		}),
	}),
})
