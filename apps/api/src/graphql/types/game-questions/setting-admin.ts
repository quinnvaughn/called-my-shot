import type {
	FieldMap,
	InputFieldBuilder,
	InputFieldMap,
	ObjectFieldBuilder,
	ObjectRef,
	SchemaTypes,
} from "@pothos/core"
import type { z } from "zod"
import { requireAdmin } from "../../../lib/auth"
import {
	AuthenticationError,
	AuthorizationError,
	NotFoundError,
} from "../../../lib/errors"
import type { SettingState } from "../../../lib/game-questions/tunable-setting"
import { builder } from "../../builder"
import { parseInput } from "../../helpers"

type Types =
	typeof builder extends PothosSchemaTypes.SchemaBuilder<infer T>
		? T
		: SchemaTypes

type SettingRow = SettingState & { leagueSlug: string }

type SettingFamily<Row, Input> = {
	template: (leagueSlug: string, key: string) => unknown
	rows: () => Promise<Row[]>
	row: (leagueSlug: string, key: string) => Promise<Row | undefined>
	save: (input: Input, updatedById: string) => Promise<void>
	reset: (leagueSlug: string, key: string) => Promise<void>
}

// Registers one admin settings page's type, list query and update/reset
// mutations. Every name follows from `name`: <name>Setting,
// Update<name>SettingInput, admin<name>Settings, adminUpdate<name>Setting and
// adminReset<name>Setting. Rows are keyed by league and `key`; a key the
// family has no template for is a NotFoundError carrying `notFound`.
export function defineSettingAdmin<
	Row extends SettingRow,
	Input extends { leagueSlug: string; autoTune: boolean },
>(config: {
	name: string
	key: string & keyof Input
	notFound: string
	settings: SettingFamily<Row, Input>
	schema: z.ZodType<Input>
	// The row's own fields, around leagueSlug and its SettingState.
	fields: (t: ObjectFieldBuilder<Types, Row>) => FieldMap
	// The values an admin saves, around leagueSlug, the key and autoTune.
	inputFields: (t: InputFieldBuilder<Types, "InputObject">) => InputFieldMap
}) {
	const { name, key, notFound, settings } = config

	const RowRef = builder.objectRef<Row>(`${name}Setting`).implement({
		fields: (t) => ({
			leagueSlug: t.string({ resolve: (row) => row.leagueSlug }),
			...config.fields(t),
			isCustom: t.boolean({ resolve: (row) => row.isCustom }),
			autoTune: t.boolean({ resolve: (row) => row.autoTune }),
			tunedAt: t.field({
				type: "DateTime",
				nullable: true,
				resolve: (row) => row.tunedAt,
			}),
		}),
	})

	// Seen through its common fields, so resolvers type-check against a
	// concrete shape rather than the generic Row.
	const SettingRef = RowRef as unknown as ObjectRef<Types, SettingRow>

	const UpdateInput = builder.inputType(`Update${name}SettingInput`, {
		fields: (t) => ({
			leagueSlug: t.string({ required: true }),
			[key]: t.string({ required: true }),
			...config.inputFields(t),
			autoTune: t.boolean({ required: true }),
		}),
	})

	const requireTemplate = (leagueSlug: string, keyValue: string) => {
		if (!settings.template(leagueSlug, keyValue)) {
			throw new NotFoundError(notFound)
		}
	}
	const requireRow = async (leagueSlug: string, keyValue: string) => {
		const row = await settings.row(leagueSlug, keyValue)
		if (!row) throw new NotFoundError(notFound)
		return row
	}
	const errors = (union: string) => ({
		types: [AuthenticationError, AuthorizationError, NotFoundError],
		directResult: true as const,
		union: { name: union },
	})

	builder.queryFields((t) => ({
		[`admin${name}Settings`]: t.field({
			type: [SettingRef],
			errors: { types: [AuthenticationError, AuthorizationError] },
			resolve: (_root, _args, ctx) => {
				requireAdmin(ctx)
				return settings.rows()
			},
		}),
	}))

	builder.mutationFields((t) => ({
		[`adminUpdate${name}Setting`]: t.field({
			type: SettingRef,
			errors: errors(`AdminUpdate${name}SettingResult`),
			args: { input: t.arg({ type: UpdateInput, required: true }) },
			resolve: async (_root, args, ctx) => {
				const admin = requireAdmin(ctx)
				const input = parseInput(config.schema, args.input)
				const keyValue = input[key] as string
				requireTemplate(input.leagueSlug, keyValue)
				await settings.save(input, admin.id)
				return requireRow(input.leagueSlug, keyValue)
			},
		}),

		[`adminReset${name}Setting`]: t.field({
			type: SettingRef,
			errors: errors(`AdminReset${name}SettingResult`),
			args: {
				leagueSlug: t.arg.string({ required: true }),
				[key]: t.arg.string({ required: true }),
			},
			resolve: async (_root, args, ctx) => {
				requireAdmin(ctx)
				const keyValue = args[key] as string
				requireTemplate(args.leagueSlug, keyValue)
				await settings.reset(args.leagueSlug, keyValue)
				return requireRow(args.leagueSlug, keyValue)
			},
		}),
	}))
}
