import {
	SEASON_PLAY_FULL_SHARE,
	SEASON_PLAY_WEEK_MIN_CALLS,
} from "@called-my-shot/scoring"
import { css } from "styled-system/css"
import { HStack } from "styled-system/jsx"
import { InfoTip } from "#/components/ui/info-tip"
import { formatMult } from "#/lib/scoring"

type Week = {
	startsOn: string
	calls: number
	played: boolean
	over: boolean
}

type Props = {
	play: {
		weight: number
		weeks: readonly Week[]
	}
	league: string
}

// startsOn is a calendar date in the sports time zone, so it's read at noon
// UTC to land on the same day wherever the viewer is.
const weekLabel = (startsOn: string) =>
	new Date(`${startsOn}T12:00:00Z`).toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
		timeZone: "UTC",
	})

const plural = (count: number, word: string) =>
	count === 1 ? `${count} ${word}` : `${count} ${word}s`

const labelClass = css({
	fontFamily: "mono",
	fontSize: "2xs",
	letterSpacing: "wide",
	color: "fg.subtle",
})

// How regularly the viewer has played this league this season, and so what
// their season-long calls are worth: the share, a square per week played or
// missed (this week's outlined until it's played), and this week's game calls
// toward the weekly mark. See
// seasonPlayWeight.
export function SeasonPlayCard({ play, league }: Props) {
	const thisWeek = play.weeks.find((week) => !week.over) ?? null
	const full = play.weight >= 1

	return (
		<HStack
			gap="4"
			flexWrap="wrap"
			rowGap="2"
			className={css({
				border: "1px solid {colors.border.default}",
				borderRadius: "lg",
				paddingBlock: "2",
				paddingInline: "3",
			})}
		>
			<HStack gap="1.5" alignItems="center">
				<span className={labelClass}>SEASON-LONG MULTIPLIER</span>
				<span
					className={css({
						fontFamily: "mono",
						fontSize: "xs",
						fontWeight: "bold",
						color: full ? "secondary.default" : "fg.default",
					})}
				>
					×{formatMult(play.weight)}
				</span>
				<InfoTip
					label="season-long multiplier"
					text={`What your ${league} season-long calls count for. A week counts once you make ${SEASON_PLAY_WEEK_MIN_CALLS} ${league} game calls in it, and playing ${Math.round(SEASON_PLAY_FULL_SHARE * 100)}% of weeks counts in full.`}
				/>
			</HStack>
			<HStack gap="1" flexWrap="wrap" flex="1" minWidth="0">
				{play.weeks.map((week) => (
					<WeekSquare
						key={week.startsOn}
						filled={week.played}
						running={!week.over}
						label={`${week.over ? "Week of" : "This week,"} ${weekLabel(week.startsOn)}: ${plural(week.calls, "game call")}`}
					/>
				))}
			</HStack>
			{thisWeek && (
				<HStack gap="1.5" alignItems="center" marginLeft="auto">
					<span className={labelClass}>THIS WEEK</span>
					<span
						className={css({
							fontFamily: "mono",
							fontSize: "xs",
							fontWeight: "bold",
							color: thisWeek.played ? "secondary.default" : "fg.default",
						})}
					>
						{Math.min(thisWeek.calls, SEASON_PLAY_WEEK_MIN_CALLS)} of{" "}
						{SEASON_PLAY_WEEK_MIN_CALLS} game calls
					</span>
				</HStack>
			)}
		</HStack>
	)
}

function WeekSquare({
	filled,
	running,
	label,
}: {
	filled: boolean
	running: boolean
	label: string
}) {
	return (
		<div
			title={label}
			role="img"
			aria-label={label}
			className={css({
				width: "2.5",
				height: "2.5",
				borderRadius: "xs",
				border:
					filled || running
						? "1px solid {colors.secondary.default}"
						: "1px solid {colors.fg.muted}",
				bg: filled ? "secondary.default" : "transparent",
			})}
		/>
	)
}
