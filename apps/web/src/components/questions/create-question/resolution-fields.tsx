import { resolutionModeFor } from "@called-my-shot/schemas"
import { isSeasonLongShape } from "@called-my-shot/scoring"
import { useQuery } from "@tanstack/react-query"
import { DateTime } from "luxon"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { ChipButton } from "#/components/ui/chip-button"
import {
	DATE_TIME_PICKER_VALUE_FORMAT,
	DateTimePicker,
} from "#/components/ui/date-time-picker"
import { FieldLabel } from "#/components/ui/field-label"
import { TextInput } from "#/components/ui/text-input"
import { gqlQueryOptions } from "#/graphql/query-options"
import { CurrentSeasonByLeagueDocument } from "#/graphql/sports/catalog/queries"
import { useQuestionData } from "./data-context"
import { Field, useWatch } from "./form-context"

const SOURCE_SUGGESTIONS = [
	"ESPN box score",
	"League official result",
	"Official league stats site",
]

type Props = {
	leagueId: string
}

export function ResolutionFields({ leagueId }: Props) {
	const gameId = useWatch("gameId")

	// Only relevant while locksAt is still manual (no game picked, which
	// otherwise drives it directly off the game's own kickoff - see
	// game-field.tsx's selectGame()).
	const { data: seasonData } = useQuery(
		gqlQueryOptions(
			CurrentSeasonByLeagueDocument,
			{ leagueId },
			{ enabled: !!leagueId && !gameId },
		),
	)
	const season = seasonData?.currentSeason ?? null

	const shape = useWatch("shape")
	const statId = useWatch("statId")
	const customStat = useWatch("customStat")
	const statAggregation = useWatch("statAggregation")
	const awardName = useWatch("awardName")
	const awardVerb = useWatch("awardVerb")
	const picksRequired = useWatch("picksRequired")
	const awardConferences = useWatch("awardConferences")
	const awardDivisions = useWatch("awardDivisions")
	const { sports, stats } = useQuestionData("ResolutionFields")
	const leagueSlug = sports
		.flatMap((sport) => sport.leagues)
		.find((league) => league.id === leagueId)?.slug
	// The same call createQuestion makes: a question ESPN settles stores ESPN
	// as its source, so there's nothing for the creator to name here.
	const resolvesAutomatically =
		!!leagueSlug &&
		resolutionModeFor({
			shape,
			leagueSlug,
			statName: stats.find((stat) => stat.id === statId)?.name,
			customStat,
			statAggregation,
			awardName,
			awardVerb,
			picksRequired,
			awardConferences,
			awardDivisions,
		}) === "system"

	return (
		<VStack gap="3.5" alignItems="stretch">
			{resolvesAutomatically ? (
				<p className={css({ fontSize: "sm", color: "fg.muted" })}>
					{shape === "team_season_award"
						? "ESPN's postseason results settle this once the winner is decided."
						: isSeasonLongShape(shape)
							? "ESPN's regular-season stats settle this after the regular season ends."
							: "ESPN's box score settles this about 30 minutes after the game ends."}
				</p>
			) : (
				<>
					<Field name="resolutionSource">
						{(field) => (
							<VStack gap="2" alignItems="stretch">
								<TextInput error={field.meta.error ?? undefined}>
									<TextInput.Label required>Resolution source</TextInput.Label>
									<TextInput.Group>
										<TextInput.Field
											placeholder="e.g. ESPN box score"
											aria-required
											value={field.value}
											onChange={field.onChange}
											onBlur={field.onBlur}
										/>
									</TextInput.Group>
								</TextInput>
								<HStack gap="1.5" flexWrap="wrap">
									{SOURCE_SUGGESTIONS.map((suggestion) => (
										<ChipButton
											key={suggestion}
											onClick={() => field.onChange(suggestion)}
										>
											{suggestion}
										</ChipButton>
									))}
								</HStack>
							</VStack>
						)}
					</Field>

					<Field name="resolutionSourceUrl">
						{(field) => (
							<TextInput error={field.meta.error ?? undefined}>
								<TextInput.Label>Source URL (optional)</TextInput.Label>
								<TextInput.Group>
									<TextInput.Field
										placeholder="https://…"
										value={field.value}
										onChange={field.onChange}
										onBlur={field.onBlur}
									/>
								</TextInput.Group>
							</TextInput>
						)}
					</Field>
				</>
			)}

			<Field name="locksAt">
				{(field) => (
					<VStack gap="1.5" alignItems="stretch">
						<FieldLabel required>Locks at</FieldLabel>
						<DateTimePicker
							value={field.value}
							onValueChange={field.onChange}
							error={field.meta.error ?? undefined}
							disabled={!!gameId}
							description={
								gameId
									? "Set to the picked game's kickoff - clear the game above to choose a different time."
									: "No one can make a call after this time."
							}
						/>
						{!gameId && season && (
							<HStack gap="1.5" flexWrap="wrap">
								<ChipButton
									onClick={() =>
										field.onChange(
											DateTime.fromISO(season.regularSeasonEndsAt).toFormat(
												DATE_TIME_PICKER_VALUE_FORMAT,
											),
										)
									}
								>
									End of regular season
								</ChipButton>
								{season.postseasonEndsAt && (
									<ChipButton
										onClick={() =>
											field.onChange(
												DateTime.fromISO(
													season.postseasonEndsAt as string,
												).toFormat(DATE_TIME_PICKER_VALUE_FORMAT),
											)
										}
									>
										End of playoffs
									</ChipButton>
								)}
							</HStack>
						)}
					</VStack>
				)}
			</Field>
		</VStack>
	)
}
