import type { UpdateLineSettingInput } from "@called-my-shot/schemas"
import {
	GAME_QUESTION_CATALOG,
	type GameQuestionTemplate,
} from "../../db/catalog/game-question-catalog"
import {
	type GameQuestionLineSetting,
	gameQuestionLineSettings,
} from "../../db/schema"
import {
	type CalibrationRow,
	lineCalibration,
	nextShade,
	ratiosByTemplate,
} from "./line-calibration"
import { GENERATED_OVER_UNDER_SHAPES, type LineRule } from "./lines"
import { defineTunableSetting, type SettingState } from "./tunable-setting"

export type OverUnderTemplate = Extract<
	GameQuestionTemplate,
	{ shape: (typeof GENERATED_OVER_UNDER_SHAPES)[number] }
>

// Both over/under templates carry a LineRule, so everything the Lines page
// and the tuner do to one works on the other unchanged.
export function isGeneratedOverUnder(
	template: GameQuestionTemplate,
): template is OverUnderTemplate {
	return (GENERATED_OVER_UNDER_SHAPES as readonly string[]).includes(
		template.shape,
	)
}

type LeagueOverUnder = OverUnderTemplate & { leagueSlug: string }

// Every over/under template in the catalog, by league then catalog order.
function overUnderTemplates(): LeagueOverUnder[] {
	return Object.entries(GAME_QUESTION_CATALOG).flatMap(
		([leagueSlug, templates]) =>
			templates.flatMap((template) =>
				isGeneratedOverUnder(template) ? [{ ...template, leagueSlug }] : [],
			),
	)
}

// One over/under template as the admin Lines page shows it: the settings its
// lines are set from now, the catalog's own, whether tuneLines is moving its
// shade, and how the lines set at the current shade have landed.
export type LineSettingRow = SettingState & {
	leagueSlug: string
	templateId: string
	statName: string
	line: LineRule
	defaultLine: LineRule
	calibration: CalibrationRow | null
}

const ruleOf = (row: GameQuestionLineSetting): LineRule => ({
	shade: row.shade,
	minLine: row.minLine,
	minGames: row.minGames,
})

const sameRule = (a: LineRule, b: LineRule) =>
	a.shade === b.shade && a.minLine === b.minLine && a.minGames === b.minGames

const settings = defineTunableSetting({
	table: gameQuestionLineSettings,
	keyField: "templateId",
	tunedField: "shade",
	templates: overUnderTemplates,
	keyOf: (template) => template.id,
	valueOf: ruleOf,
	tune: {
		job: "tune-lines",
		label: "shade",
		unit: "template(s)",
		load: ratiosByTemplate,
		defaultValue: (template) => template.line.shade,
		next: (current, template, ratios) =>
			nextShade(
				current,
				ratios.get(`${template.leagueSlug}:${template.id}`) ?? [],
			),
		// Minimum games and the lowest line stay as they are.
		insertDefaults: (template) => ({
			minLine: template.line.minLine,
			minGames: template.line.minGames,
		}),
	},
	rows: {
		load: () => lineCalibration(),
		build: (template, saved, calibration) => {
			const line = saved ? ruleOf(saved) : template.line
			return {
				leagueSlug: template.leagueSlug,
				templateId: template.id,
				statName: template.statName,
				line,
				defaultLine: template.line,
				calibration:
					calibration.find(
						(c) =>
							c.league === template.leagueSlug &&
							c.template === template.id &&
							c.shade === line.shade,
					) ?? null,
			}
		},
	},
})

// Each over/under template's line settings, its shade tuned toward the over
// hitting half the time.
export const lineSettings = {
	...settings,
	// Saving the catalog's own settings with tuning on clears the row, so the
	// template follows the catalog again.
	save: async (
		input: UpdateLineSettingInput,
		updatedById: string,
	): Promise<void> => {
		const template = settings.template(input.leagueSlug, input.templateId)
		if (input.autoTune && template && sameRule(input, template.line)) {
			return settings.reset(input.leagueSlug, input.templateId)
		}
		return settings.save(input, updatedById)
	},
}

export const loadLineSettings = lineSettings.loadLeague

// Each over/under template set from its saved settings where it has any.
export function withLineSettings(
	templates: GameQuestionTemplate[],
	saved: Map<string, LineRule>,
): GameQuestionTemplate[] {
	return templates.map((template) =>
		isGeneratedOverUnder(template)
			? { ...template, line: saved.get(template.id) ?? template.line }
			: template,
	)
}
