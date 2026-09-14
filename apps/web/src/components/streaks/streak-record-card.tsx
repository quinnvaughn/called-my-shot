import { questionTitleWithGame } from "@called-my-shot/schemas"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { Avatar } from "#/components/ui/avatar"
import { Brand } from "#/components/ui/brand"
import { Card } from "#/components/ui/card"
import { Eyebrow } from "#/components/ui/eyebrow"
import { type FragmentType, graphql, useFragment } from "#/graphql/generated"
import { pickSummary } from "#/lib/call-summary"
import { pluralize } from "#/lib/pluralize"
import { RecordStatRow } from "./record-stat-row"

export const StreakRecordCardLastHitFragment = graphql(`
	fragment StreakRecordCard_lastHit on Call {
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
					id
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
			}
		}
	}
`)

type Props = {
	leagueAbbr: string
	familyLabel: string
	name: string
	username: string
	currentLength: number
	bestLength: number
	// The run the card leads with: the current one while it's going, the best
	// one once it isn't. Pre-formatted by formatCallDate.
	runStartedAt: string | null
	// That run's most recent win.
	lastHit: FragmentType<typeof StreakRecordCardLastHitFragment> | null
}

// The centrepiece of a streak page, stating the same facts as its og:image
// (apps/api's share-cards/streak-card.ts): the hero run, the best, when the
// run began and the call that last extended it.
export function StreakRecordCard(props: Props) {
	const lastHit = useFragment(StreakRecordCardLastHitFragment, props.lastHit)
	const going = props.currentLength > 0
	const runLength = going ? props.currentLength : props.bestLength
	const track = `${props.leagueAbbr} ${props.familyLabel}`

	return (
		<Card size="md">
			<Card.Header>
				<VStack gap="4" alignItems="center" width="full">
					<Brand size="sm" />
					<VStack gap="1.5" alignItems="center">
						<Eyebrow size="sm" variant="neutral">
							{props.leagueAbbr} · {props.familyLabel} streak
						</Eyebrow>
						<span
							className={css({
								fontFamily: "heading",
								fontSize: { base: "4xl", sm: "6xl" },
								lineHeight: "1",
								textAlign: "center",
							})}
						>
							{runLength} in a row
						</span>
						<span
							className={css({
								fontSize: "xs",
								color: "fg.subtle",
								textAlign: "center",
							})}
						>
							{going
								? `${track} ${pluralize(runLength, "call")} right`
								: `Best run on ${track}`}
						</span>
					</VStack>
					<HStack gap="2" alignItems="center">
						<Avatar size="xs" name={props.name} />
						<span
							className={css({
								fontFamily: "mono",
								fontSize: "xs",
								color: "fg.muted",
							})}
						>
							@{props.username}
						</span>
					</HStack>
				</VStack>
			</Card.Header>
			<Card.Body>
				<VStack gap="2.5" alignItems="stretch">
					<RecordStatRow label="Current" value={String(props.currentLength)} />
					<RecordStatRow label="Best" value={String(props.bestLength)} />
					<RecordStatRow
						label="Run started"
						value={props.runStartedAt ?? "-"}
					/>
					<RecordStatRow
						label="Last hit"
						value={
							lastHit ? (
								<VStack gap="0.5" alignItems="flex-end">
									<span>{pickSummary(lastHit)}</span>
									<span
										className={css({
											fontSize: "xs",
											fontWeight: "normal",
											color: "fg.subtle",
										})}
									>
										{questionTitleWithGame(
											lastHit.question.title,
											lastHit.question.game,
										)}
									</span>
								</VStack>
							) : (
								"-"
							)
						}
					/>
				</VStack>
			</Card.Body>
			<Card.Footer>
				<HStack
					justify="space-between"
					alignItems="center"
					className={css({ color: "fg.muted", fontSize: "2xs" })}
				>
					<span>calledmyshot.com/{props.username}</span>
					<span>{track}</span>
				</HStack>
			</Card.Footer>
		</Card>
	)
}
