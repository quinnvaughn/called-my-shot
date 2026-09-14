import { and, eq } from "drizzle-orm"
import { db } from "../../db"
import {
	GAME_QUESTION_CATALOG,
	type GameQuestionTemplate,
} from "../../db/catalog/game-question-catalog"
import {
	type GameQuestionLineSetting,
	gameQuestionLineSettings,
} from "../../db/schema"
import { type CalibrationRow, lineCalibration } from "./line-calibration"
import type { LineRule } from "./lines"

export type OverUnderTemplate = Extract<
	GameQuestionTemplate,
	{ shape: "player_stat_over_under" }
>

// One over/under template as the admin Lines page shows it: the settings its
// lines are set from now, the catalog's own, whether tuneLines is moving its
// shade, and how the lines set at the current shade have landed.
export type LineSettingRow = {
	leagueSlug: string
	templateId: string
	statName: string
	line: LineRule
	defaultLine: LineRule
	// Whether a saved row replaces the catalog's settings.
	isCustom: boolean
	autoTune: boolean
	tunedAt: Date | null
	calibration: CalibrationRow | null
}

const ruleOf = (row: GameQuestionLineSetting): LineRule => ({
	shade: row.shade,
	minLine: row.minLine,
	minGames: row.minGames,
})

const sameRule = (a: LineRule, b: LineRule) =>
	a.shade === b.shade && a.minLine === b.minLine && a.minGames === b.minGames

export function overUnderTemplate(
	leagueSlug: string,
	templateId: string,
): OverUnderTemplate | undefined {
	const template = GAME_QUESTION_CATALOG[leagueSlug]?.find(
		(t) => t.id === templateId,
	)
	return template?.shape === "player_stat_over_under" ? template : undefined
}

// A league's saved line settings by template id.
export async function loadLineSettings(
	leagueSlug: string,
): Promise<Map<string, LineRule>> {
	const rows = await db
		.select()
		.from(gameQuestionLineSettings)
		.where(eq(gameQuestionLineSettings.leagueSlug, leagueSlug))
	return new Map(rows.map((row) => [row.templateId, ruleOf(row)]))
}

// Each over/under template set from its saved settings where it has any.
export function withLineSettings(
	templates: GameQuestionTemplate[],
	settings: Map<string, LineRule>,
): GameQuestionTemplate[] {
	return templates.map((template) =>
		template.shape === "player_stat_over_under"
			? { ...template, line: settings.get(template.id) ?? template.line }
			: template,
	)
}

// Every over/under template in the catalog, by league then catalog order.
export async function lineSettingRows(): Promise<LineSettingRow[]> {
	const [saved, calibration] = await Promise.all([
		db.select().from(gameQuestionLineSettings),
		lineCalibration(),
	])
	const savedByKey = new Map(
		saved.map((row) => [`${row.leagueSlug}:${row.templateId}`, row]),
	)
	return Object.entries(GAME_QUESTION_CATALOG).flatMap(
		([leagueSlug, templates]) =>
			templates.flatMap((template) => {
				if (template.shape !== "player_stat_over_under") return []
				const row = savedByKey.get(`${leagueSlug}:${template.id}`)
				const line = row ? ruleOf(row) : template.line
				return [
					{
						leagueSlug,
						templateId: template.id,
						statName: template.statName,
						line,
						defaultLine: template.line,
						isCustom: !!row,
						autoTune: row?.autoTune ?? true,
						tunedAt: row?.tunedAt ?? null,
						calibration:
							calibration.find(
								(c) =>
									c.league === leagueSlug &&
									c.template === template.id &&
									c.shade === line.shade,
							) ?? null,
					},
				]
			}),
	)
}

export async function lineSettingRow(
	leagueSlug: string,
	templateId: string,
): Promise<LineSettingRow | undefined> {
	return (await lineSettingRows()).find(
		(row) => row.leagueSlug === leagueSlug && row.templateId === templateId,
	)
}

// Back to the catalog's settings, tuned automatically.
export async function resetLineSetting(
	leagueSlug: string,
	templateId: string,
): Promise<void> {
	await db
		.delete(gameQuestionLineSettings)
		.where(
			and(
				eq(gameQuestionLineSettings.leagueSlug, leagueSlug),
				eq(gameQuestionLineSettings.templateId, templateId),
			),
		)
}

// Saving the catalog's own settings with tuning on clears the row, so the
// template follows the catalog again.
export async function saveLineSetting(
	template: OverUnderTemplate,
	input: { leagueSlug: string; autoTune: boolean } & LineRule,
	updatedById: string,
): Promise<void> {
	const line: LineRule = {
		shade: input.shade,
		minLine: input.minLine,
		minGames: input.minGames,
	}
	if (input.autoTune && sameRule(line, template.line)) {
		await resetLineSetting(input.leagueSlug, template.id)
		return
	}
	const values = {
		...line,
		autoTune: input.autoTune,
		updatedById,
		updatedAt: new Date(),
	}
	await db
		.insert(gameQuestionLineSettings)
		.values({
			leagueSlug: input.leagueSlug,
			templateId: template.id,
			...values,
		})
		.onConflictDoUpdate({
			target: [
				gameQuestionLineSettings.leagueSlug,
				gameQuestionLineSettings.templateId,
			],
			set: values,
		})
}
