import { questionTitleWithGame } from "@called-my-shot/schemas"
import { Link } from "@tanstack/react-router"
import { css, cx } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { Eyebrow } from "#/components/ui/eyebrow"
import { PlayerOrTeamImage } from "#/components/ui/player-or-team-image"
import { signTone } from "#/components/ui/sign-tone"
import { type FragmentType, graphql, useFragment } from "#/graphql/generated"
import { pickSummary } from "#/lib/call-summary"
import { formatSigned } from "#/lib/format-number"

// What pickSummary needs plus the question's title and matchup. It
// deliberately leaves out the optional margin fields (numericTolerancePct,
// scoredOptions, option.actualValue) - a highlight states the pick, what it
// answered, and the points, and selecting a leader pool's worth of options to render "Josh Allen" would
// be a real cost for no gain. See the comment on CallSummaryData in
// #/lib/call-summary for why those are opt-in.
const HighlightFragment = graphql(`
	fragment ReportCardHighlight_call on Call {
		id
		guessValue
		conviction
		totalPoints
		question {
			id
			title
			shape
			ouLine
			numericActualValue
			numericToleranceAbsolute
			stat {
				id
				toleranceTier {
					toleranceMode
					toleranceValue
				}
			}
			game {
				id
				awayTeam {
					id
					abbreviation
				}
				homeTeam {
					id
					abbreviation
				}
			}
		}
		selections {
			id
			conviction
			option {
				id
				label
				isCorrect
				team {
					...Team_team @unmask
				}
				player {
					id
					name
					headshotUrl
				}
			}
		}
	}
`)

export function ReportCardHighlight({
	label,
	call,
}: {
	label: string
	call: FragmentType<typeof HighlightFragment> | null | undefined
}) {
	const data = useFragment(HighlightFragment, call ?? null)
	if (!data) return null
	return (
		<HStack
			justify="space-between"
			alignItems="baseline"
			gap="3"
			className={css({ paddingY: "1" })}
		>
			<VStack
				gap="0"
				alignItems="flex-start"
				className={css({ minWidth: "0" })}
			>
				<Eyebrow size="sm" variant="neutral">
					{label}
				</Eyebrow>
				<HStack gap="2" alignItems="center" minWidth="0" maxWidth="full">
					{data.selections.length === 1 && (
						<PlayerOrTeamImage
							player={data.selections[0]?.option.player}
							team={data.selections[0]?.option.team}
						/>
					)}
					<Link
						to="/calls/$callId"
						params={{ callId: data.id }}
						className={css({
							fontSize: "sm",
							color: "fg.default",
							textDecoration: "none",
							truncate: true,
							_hover: { textDecoration: "underline" },
						})}
					>
						{pickSummary(data)}
					</Link>
				</HStack>
				{/* A bare pick ("Under 0.5") says nothing without the question it
				    answers. */}
				<span
					className={css({
						fontSize: "xs",
						color: "fg.subtle",
						truncate: true,
						maxWidth: "full",
					})}
				>
					{questionTitleWithGame(data.question.title, data.question.game)}
				</span>
			</VStack>
			<span
				className={cx(
					css({
						fontFamily: "mono",
						fontSize: "sm",
						fontWeight: "bold",
						whiteSpace: "nowrap",
					}),
					signTone(data.totalPoints ?? 0),
				)}
			>
				{formatSigned(data.totalPoints ?? 0, { zeroSign: true })}
			</span>
		</HStack>
	)
}
