import { useQuery } from "@tanstack/react-query"
import { DateTime } from "luxon"
import { HStack, VStack } from "styled-system/jsx"
import { ChipButton } from "#/components/ui/chip-button"
import {
	DATE_TIME_PICKER_VALUE_FORMAT,
	DateTimePicker,
} from "#/components/ui/date-time-picker"
import { FieldLabel } from "#/components/ui/field-label"
import { TextInput } from "#/components/ui/text-input"
import { CurrentSeasonByLeagueDocument } from "#/graphql/queries/sports"
import { gqlQueryOptions } from "#/graphql/query-options"
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

	return (
		<VStack gap="3.5" alignItems="stretch">
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
