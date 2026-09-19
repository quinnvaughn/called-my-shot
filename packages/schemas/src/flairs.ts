import { z } from "zod"

// The lowercase values here are the api's pg enums and the values GraphQL
// resolves to; only the wire names are SCREAMING_SNAKE. Same split as
// questionShapeSchema and the rest of this package.

// Where a flair came from. What the picker groups by, not what decides
// whether you may wear it - that's flairUnlockSchema below.
export const flairSourceSchema = z.enum([
	"team",
	"achievement",
	"group",
	"purchase",
])
export type FlairSource = z.infer<typeof flairSourceSchema>

// "open" is equippable by anyone it's in scope for with nothing stored
// anywhere, which is every team flair. "grant" needs a row saying this user
// has it.
export const flairUnlockSchema = z.enum(["open", "grant"])
export type FlairUnlock = z.infer<typeof flairUnlockSchema>

export const flairStatusSchema = z.enum(["active", "retired"])
export type FlairStatus = z.infer<typeof flairStatusSchema>

export const equipFlairSchema = z.object({
	flairId: z.uuid(),
})
export type EquipFlairInput = z.infer<typeof equipFlairSchema>
