import { z } from "zod"

// Data tab CRUD (leagues/teams/players/games) - admin-only, deliberately
// light validation to match how lightly-specified this part of the admin
// panel is. Lowercase to match the values the GraphQL layer resolves these
// enums to server-side, same convention as questionTypeSchema etc. in
// questions.ts.
export const leagueStatusSchema = z.enum(["active", "inactive"])
export const gameStatusSchema = z.enum(["scheduled", "live", "final"])

const leagueFieldsSchema = z.object({
	sportId: z.string().uuid("Pick a sport"),
	name: z.string().trim().min(1, "Name is required"),
	abbreviation: z.string().trim().min(1, "Abbreviation is required"),
	slug: z.string().trim().min(1, "Slug is required"),
	status: leagueStatusSchema.default("active"),
})
export const createLeagueSchema = leagueFieldsSchema
export type CreateLeagueInput = z.infer<typeof createLeagueSchema>
export const updateLeagueSchema = leagueFieldsSchema.extend({
	id: z.string().uuid(),
})
export type UpdateLeagueInput = z.infer<typeof updateLeagueSchema>

const teamFieldsSchema = z.object({
	leagueId: z.string().uuid("Pick a league"),
	name: z.string().trim().min(1, "Name is required"),
	abbreviation: z.string().trim().min(1, "Abbreviation is required"),
	color: z
		.string()
		.trim()
		.regex(/^#[0-9a-fA-F]{6}$/, "Enter a hex color like #007A33"),
	// Free text, same reasoning as players.position - conferences/divisions
	// vary too much by sport for an enum. Usually sync-populated (see
	// db/sync/sync-teams.ts), hand-editable here for leagues/teams sync
	// doesn't cover.
	conference: z.string().trim().default(""),
	division: z.string().trim().default(""),
})
export const createTeamSchema = teamFieldsSchema
export type CreateTeamInput = z.infer<typeof createTeamSchema>
export const updateTeamSchema = teamFieldsSchema.extend({
	id: z.string().uuid(),
})
export type UpdateTeamInput = z.infer<typeof updateTeamSchema>

// currentTeamId is optional - free agents/retired players have none.
const playerFieldsSchema = z.object({
	currentTeamId: z.string().uuid().optional(),
	name: z.string().trim().min(1, "Name is required"),
	// Free text, same reasoning as players.position on the table - positions
	// vary too much by sport for an enum.
	position: z.string().trim().default(""),
})
export const createPlayerSchema = playerFieldsSchema
export type CreatePlayerInput = z.infer<typeof createPlayerSchema>
export const updatePlayerSchema = playerFieldsSchema.extend({
	id: z.string().uuid(),
})
export type UpdatePlayerInput = z.infer<typeof updatePlayerSchema>

const gameFieldsSchema = z.object({
	leagueId: z.string().uuid("Pick a league"),
	homeTeamId: z.string().uuid("Pick the home team"),
	awayTeamId: z.string().uuid("Pick the away team"),
	startsAt: z
		.string()
		.min(1, "Pick a start time")
		.refine(
			(value) => !Number.isNaN(new Date(value).getTime()),
			"Pick a valid start time",
		),
	status: gameStatusSchema.default("scheduled"),
	// Only meaningful once status is "final" - see the superRefine below. No
	// live stats feed exists yet, so an admin enters these by hand.
	homeScore: z.number().int().optional(),
	awayScore: z.number().int().optional(),
})
function validateGameFields(
	data: z.infer<typeof gameFieldsSchema>,
	ctx: z.RefinementCtx,
) {
	if (data.homeTeamId === data.awayTeamId) {
		ctx.addIssue({
			code: "custom",
			path: ["awayTeamId"],
			message: "Home and away teams must be different",
		})
	}
	if (data.status === "final") {
		if (data.homeScore === undefined) {
			ctx.addIssue({
				code: "custom",
				path: ["homeScore"],
				message: "Enter the final home score",
			})
		}
		if (data.awayScore === undefined) {
			ctx.addIssue({
				code: "custom",
				path: ["awayScore"],
				message: "Enter the final away score",
			})
		}
	}
}
export const createGameSchema = gameFieldsSchema.superRefine(validateGameFields)
export type CreateGameInput = z.infer<typeof createGameSchema>
export const updateGameSchema = gameFieldsSchema
	.extend({ id: z.string().uuid() })
	.superRefine(validateGameFields)
export type UpdateGameInput = z.infer<typeof updateGameSchema>
