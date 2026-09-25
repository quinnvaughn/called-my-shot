import type { QuestionShape } from "@called-my-shot/scoring"
import { and, eq, type InferSelectModel } from "drizzle-orm"
import type { PgColumn, PgTable } from "drizzle-orm/pg-core"
import { db } from "../../db"
import {
	type HitCount,
	type LossRateTuner,
	ownHitRate,
	sumHits,
} from "./pooling"

// The columns every tunable settings table shares: one row per league and
// key, holding values used in place of a default, moved by its tune job until
// an admin turns that off. A key with no row uses the default and is tuned
// automatically.
type SettingsTable = PgTable & {
	leagueSlug: PgColumn
	autoTune: PgColumn
	tunedAt: PgColumn
	updatedAt: PgColumn
}

type SavedSetting = {
	leagueSlug: string
	autoTune: boolean
	tunedAt: Date | null
}

// Where a row stands against its default, as every admin settings page shows
// it.
export type SettingState = {
	isCustom: boolean
	autoTune: boolean
	tunedAt: Date | null
}

type TunableSettingConfig<
	TTable extends SettingsTable,
	T extends { leagueSlug: string },
	V,
	TuneCtx,
	RowCtx,
	Row,
> = {
	table: TTable
	// The column a league's rows are keyed by, alongside leagueSlug.
	keyField: string & keyof InferSelectModel<TTable>
	// The column the tune job moves.
	tunedField: string & keyof InferSelectModel<TTable>
	// Every key a setting exists for, in the order the admin page lists them.
	templates: () => T[]
	keyOf: (template: T) => string
	// What a saved row sets in place of the default.
	valueOf: (saved: InferSelectModel<TTable>) => V
	tune: {
		// Log prefix, the scheduler's job name.
		job: string
		// What the log calls the tuned value and the things it moves.
		label: string
		unit: string
		load: (now: Date) => Promise<TuneCtx>
		// The value tuning moves from while there's no saved row, or null to
		// leave the template.
		defaultValue: (template: T, ctx: TuneCtx) => number | null
		// The value to move to from `current`, or null to leave it.
		next: (current: number, template: T, ctx: TuneCtx) => number | null
		// The other columns a row the tuner creates starts with.
		insertDefaults?: (template: T) => Record<string, unknown>
	}
	rows: {
		// Whatever the rows for `templates` are built from.
		load: (templates: T[], now: Date) => Promise<RowCtx>
		build: (
			template: T,
			saved: InferSelectModel<TTable> | undefined,
			ctx: RowCtx,
		) => Row | Promise<Row>
	}
}

// Loads, tunes and saves one family of admin-tunable game question settings
// (lines, bands, leader and title loss rates) from the table that holds them.
export function defineTunableSetting<
	TTable extends SettingsTable,
	T extends { leagueSlug: string },
	V,
	TuneCtx,
	RowCtx,
	Row,
>(config: TunableSettingConfig<TTable, T, V, TuneCtx, RowCtx, Row>) {
	type Saved = InferSelectModel<TTable> & SavedSetting
	const { table, keyField, tunedField, keyOf } = config
	const keyColumn = (table as unknown as Record<string, PgColumn>)[
		keyField
	] as PgColumn
	const savedKey = (saved: Saved) => `${saved.leagueSlug}:${saved[keyField]}`
	const templateKey = (template: T) =>
		`${template.leagueSlug}:${keyOf(template)}`
	const where = (leagueSlug: string, key: string) =>
		and(eq(table.leagueSlug, leagueSlug), eq(keyColumn, key))
	const loadAll = async () =>
		new Map(
			((await db.select().from(table as PgTable)) as Saved[]).map((saved) => [
				savedKey(saved),
				saved,
			]),
		)

	const template = (leagueSlug: string, key: string): T | undefined =>
		config
			.templates()
			.find((t) => t.leagueSlug === leagueSlug && keyOf(t) === key)

	async function rowsOf(
		templates: T[],
		now: Date,
	): Promise<(Row & SettingState)[]> {
		const [saved, ctx] = await Promise.all([
			loadAll(),
			config.rows.load(templates, now),
		])
		return Promise.all(
			templates.map(async (t) => {
				const row = saved.get(templateKey(t))
				return {
					...(await config.rows.build(t, row, ctx)),
					isCustom: !!row,
					autoTune: row?.autoTune ?? true,
					tunedAt: row?.tunedAt ?? null,
				}
			}),
		)
	}

	// Saves an admin's values for one key. Any saved value turns tuning on or
	// off with them.
	async function save(
		input: { leagueSlug: string; autoTune: boolean } & Record<string, unknown>,
		updatedById: string,
	): Promise<void> {
		const { leagueSlug, autoTune, [keyField]: key, ...values } = input
		const set = { ...values, autoTune, updatedById, updatedAt: new Date() }
		await db
			.insert(table)
			.values({ leagueSlug, [keyField]: key, ...set } as never)
			.onConflictDoUpdate({
				target: [table.leagueSlug, keyColumn],
				set: set as never,
			})
	}

	return {
		template,

		// Every key, in templates order.
		rows: (now = new Date()) => rowsOf(config.templates(), now),

		row: async (leagueSlug: string, key: string, now = new Date()) => {
			const found = template(leagueSlug, key)
			return found ? (await rowsOf([found], now))[0] : undefined
		},

		// A league's saved values by key.
		loadLeague: async (leagueSlug: string): Promise<Map<string, V>> => {
			const rows = (await db
				.select()
				.from(table as PgTable)
				.where(eq(table.leagueSlug, leagueSlug))) as Saved[]
			return new Map(
				rows.map((row) => [String(row[keyField]), config.valueOf(row)]),
			)
		},

		// The saved value for one league's key, or null to use the default.
		valueFor: async (leagueId: string, key: string): Promise<V | null> => {
			const league = await db.query.leagues.findFirst({
				where: { id: leagueId },
				columns: { slug: true },
			})
			if (!league) return null
			const [saved] = await db
				.select()
				.from(table as PgTable)
				.where(where(league.slug, key))
			return saved ? config.valueOf(saved as Saved) : null
		},

		// Back to the default, tuned automatically.
		reset: async (leagueSlug: string, key: string): Promise<void> => {
			await db.delete(table).where(where(leagueSlug, key))
		},

		save,

		// Moves every key left on automatic by the family's rule. Returns how
		// many moved.
		tune: async (now = new Date()): Promise<number> => {
			const { job, label, unit } = config.tune
			const [saved, ctx] = await Promise.all([loadAll(), config.tune.load(now)])
			let tuned = 0
			for (const t of config.templates()) {
				const key = templateKey(t)
				const row = saved.get(key)
				if (row && !row.autoTune) continue
				const current = row
					? (row[tunedField] as number)
					: config.tune.defaultValue(t, ctx)
				if (current === null) continue
				const next = config.tune.next(current, t, ctx)
				if (next === null) continue

				// The conflict update only lands on a row still on automatic, so
				// an admin switching the key to manual mid-run keeps theirs.
				await db
					.insert(table)
					.values({
						leagueSlug: t.leagueSlug,
						[keyField]: keyOf(t),
						...config.tune.insertDefaults?.(t),
						[tunedField]: next,
						autoTune: true,
						tunedAt: now,
						updatedAt: now,
					} as never)
					.onConflictDoUpdate({
						target: [table.leagueSlug, keyColumn],
						set: { [tunedField]: next, tunedAt: now, updatedAt: now } as never,
						setWhere: eq(table.autoTune, true),
					})
				console.log(`[${job}] ${key}: ${label} ${current} -> ${next}`)
				tuned++
			}
			console.log(`[${job}] done, ${tuned} ${unit} tuned`)
			return tuned
		},
	}
}

// Each league's id by slug and each named stat of its sport, for a family's
// templates, in two queries.
export async function leagueStatLookup(
	templates: { leagueSlug: string; statName?: string }[],
) {
	const leagues = await db.query.leagues.findMany({
		where: { slug: { in: [...new Set(templates.map((t) => t.leagueSlug))] } },
		columns: { id: true, slug: true, sportId: true },
	})
	const statNames = [
		...new Set(templates.flatMap((t) => (t.statName ? [t.statName] : []))),
	]
	const stats =
		leagues.length === 0 || statNames.length === 0
			? []
			: await db.query.stats.findMany({
					where: {
						sportId: { in: leagues.map((league) => league.sportId) },
						name: { in: statNames },
					},
					with: { toleranceTier: true, teamToleranceTier: true },
				})
	const league = (leagueSlug: string) =>
		leagues.find((l) => l.slug === leagueSlug)
	return {
		league,
		stat: (leagueSlug: string, statName: string) => {
			const found = league(leagueSlug)
			const stat = stats.find(
				(s) => s.sportId === found?.sportId && s.name === statName,
			)
			return found && stat ? { leagueId: found.id, stat } : undefined
		},
	}
}

export type LeagueStatLookup = Awaited<ReturnType<typeof leagueStatLookup>>

type CallerPicks = { picks: number; hitRate: number | null }

// Real scored picks on resolved questions matching `question`. For comparison
// only: with a handful of callers this says little, and it mixes in how good
// the callers are.
export async function callerPicks(question: {
	leagueId: string
	shape: QuestionShape
	status: "resolved"
	statId?: string
	awardName?: string
	picksRequired?: number
}): Promise<CallerPicks> {
	const rows = await db.query.callSelections.findMany({
		where: { resultPoints: { isNotNull: true }, call: { question } },
		columns: { id: true },
		with: { option: { columns: { isCorrect: true } } },
	})
	const hits = rows.filter((row) => row.option?.isCorrect === true).length
	return {
		picks: rows.length,
		hitRate: rows.length === 0 ? null : hits / rows.length,
	}
}

// How a loss rate family's record reads for one key.
export type LossRateCalibration = {
	// The key's resolved questions within the tuning window.
	resolved: number
	// How often the pick the rate is set for (the favorite, the best record)
	// hit those.
	ownHitRate: number | null
	// That record leaning on every other key's while it's small - what the
	// rate is tuned from.
	blendedHitRate: number | null
	// The rate that pick is priced at, from the blended record.
	suggestedLossRate: number | null
	callerPicks: number
	callerHitRate: number | null
}

export type LossRateRow<T> = T &
	SettingState & {
		lossRate: number
		defaultLossRate: number
		calibration: LossRateCalibration
	}

type LossRateContext = { results: Map<string, boolean[]>; pool: HitCount }

// A tunable loss rate priced off one pick (the favorite, the best record), from
// that pick's record pooled across every key.
export function defineLossRateSetting<
	TTable extends SettingsTable & { lossRate: PgColumn },
	T extends { leagueSlug: string },
>(config: {
	table: TTable
	keyField: string & keyof InferSelectModel<TTable>
	job: string
	templates: () => T[]
	keyOf: (template: T) => string
	defaultRate: number
	rates: LossRateTuner
	// Each key's results, most recent first, and the key its results are
	// filed under.
	loadResults: () => Promise<Map<string, boolean[]>>
	resultsKey: (template: T) => string
	// Real picks on one key's questions, found through `lookup`.
	callers: (template: T, lookup: LeagueStatLookup) => Promise<CallerPicks>
}) {
	const { rates, defaultRate, resultsKey } = config
	const loadContext = async (): Promise<LossRateContext> => {
		const results = await config.loadResults()
		return { results, pool: sumHits(results.values()) }
	}
	const blended = (template: T, ctx: LossRateContext) =>
		rates.blended(ctx.results.get(resultsKey(template)) ?? [], ctx.pool)

	return defineTunableSetting({
		table: config.table,
		keyField: config.keyField,
		tunedField: "lossRate" as string & keyof InferSelectModel<TTable>,
		templates: config.templates,
		keyOf: config.keyOf,
		valueOf: (saved) => (saved as { lossRate: number }).lossRate,
		tune: {
			job: config.job,
			label: "loss rate",
			unit: "rate(s)",
			load: loadContext,
			defaultValue: () => defaultRate,
			next: (current, template, ctx) =>
				rates.next(current, blended(template, ctx), ctx.pool.total),
		},
		rows: {
			load: async (templates) => {
				const [ctx, lookup] = await Promise.all([
					loadContext(),
					leagueStatLookup(templates),
				])
				return { ...ctx, lookup }
			},
			build: async (template, saved, ctx) => {
				const results = ctx.results.get(resultsKey(template)) ?? []
				const rate = blended(template, ctx)
				const callers = await config.callers(template, ctx.lookup)
				return {
					...template,
					lossRate:
						(saved as { lossRate: number } | undefined)?.lossRate ??
						defaultRate,
					defaultLossRate: defaultRate,
					calibration: {
						resolved: results.length,
						ownHitRate: ownHitRate(results),
						blendedHitRate: rate,
						suggestedLossRate: rates.suggested(rate),
						callerPicks: callers.picks,
						callerHitRate: callers.hitRate,
					},
				}
			},
		},
	})
}
