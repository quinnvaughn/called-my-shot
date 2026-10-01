import { questionTitleWithGame } from "@called-my-shot/schemas"
import { Link } from "@tanstack/react-router"
import type { ReactNode } from "react"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import {
	RecordTag,
	type RecordTone,
} from "#/components/questions/call-record-card"
import { Avatar } from "#/components/ui/avatar"
import { Card } from "#/components/ui/card"
import { Eyebrow } from "#/components/ui/eyebrow"
import { type FragmentType, graphql, useFragment } from "#/graphql/generated"
import { pickSummary } from "#/lib/call-summary"
import { coldStreakText } from "#/lib/streak-meta"
import { PointsTotal } from "./points-total"
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
	avatarUrl: string | null
	// Which side of the track this card is about. A track can only be live on
	// one of them at a time, so the page picks before it renders.
	mode: "hot" | "cold"
	currentLength: number
	bestLength: number
	currentColdLength: number
	worstColdLength: number
	// The run the card leads with: the live one while it's going, the record
	// one once it isn't. Pre-formatted by formatCallDate.
	runStartedAt: string | null
	// That run's most recent call: its last win on a hot card, its last miss
	// on a cold one.
	lastCall: FragmentType<typeof StreakRecordCardLastHitFragment> | null
	// What the run's calls scored between them: won on a hot run, lost on a
	// cold one.
	runPoints: number
	// Hot runs only: the milestone bonuses the run has paid on top of its
	// calls' own points. Null on a cold run, which pays none.
	runBonus: number | null
	// A live hot run only: the length its next bonus pays at.
	nextMilestone: number | null
	// Where to go from here and the ways of sending the streak on, owned by
	// the page, which knows the viewer.
	footer: ReactNode
}

// The centrepiece of a streak page, laid out like CallRecordCard: whose run
// it is and how it stands across the top, the run at the pick's scale, then
// its points, then the record behind it.
export function StreakRecordCard(props: Props) {
	const lastCall = useFragment(StreakRecordCardLastHitFragment, props.lastCall)
	const cold = props.mode === "cold"
	const going = cold ? props.currentColdLength > 0 : props.currentLength > 0
	const runLength = cold
		? props.currentColdLength || props.worstColdLength
		: props.currentLength || props.bestLength
	const track = `${props.leagueAbbr} ${props.familyLabel}`
	// Active means the next settled call on the track extends this run or
	// ends it. Ended is a record run, shown because nothing is live.
	const tag: { tone: RecordTone; label: string } = going
		? cold
			? { tone: "danger", label: "Active" }
			: { tone: "success", label: "Active" }
		: { tone: "pending", label: "Ended" }

	return (
		<Card size="md">
			<Card.Header>
				<VStack gap="4" alignItems="stretch" width="full">
					<HStack justify="space-between" gap="3" alignItems="center">
						<Link
							to="/user/$username"
							params={{ username: props.username }}
							className={css({
								display: "inline-flex",
								alignItems: "center",
								gap: "2",
								minWidth: "0",
								textDecoration: "none",
								color: "fg.default",
								_hover: { "& span": { textDecoration: "underline" } },
							})}
						>
							<Avatar size="xs" name={props.name} src={props.avatarUrl} />
							<span
								className={css({
									fontFamily: "mono",
									fontSize: "xs",
									overflow: "hidden",
									textOverflow: "ellipsis",
									whiteSpace: "nowrap",
								})}
							>
								@{props.username}
							</span>
						</Link>
						<RecordTag tone={tag.tone}>{tag.label}</RecordTag>
					</HStack>
					<VStack gap="3" alignItems="flex-start">
						<Eyebrow size="sm" variant="neutral">
							{track} {cold ? "cold streak" : going ? "streak" : "best run"}
						</Eyebrow>
						<span
							className={css({
								fontFamily: "heading",
								fontSize: { base: "2xl", sm: "3xl" },
								lineHeight: "1.15",
							})}
						>
							{cold ? coldStreakText(runLength) : `${runLength} in a row`}
						</span>
						<PointsTotal
							callPoints={props.runPoints}
							bonus={props.runBonus ?? 0}
							bonusLabel="streak bonus"
							label="Run points"
						/>
					</VStack>
				</VStack>
			</Card.Header>
			<Card.Body>
				<VStack gap="2.5" alignItems="stretch">
					<RecordStatRow
						label={cold ? "Cold" : "Current"}
						value={String(cold ? props.currentColdLength : props.currentLength)}
					/>
					<RecordStatRow
						label={cold ? "Worst" : "Best"}
						value={String(cold ? props.worstColdLength : props.bestLength)}
					/>
					{props.nextMilestone !== null && (
						<RecordStatRow
							label="Next bonus"
							value={`At ${props.nextMilestone} in a row`}
						/>
					)}
					<RecordStatRow
						label={cold ? "Started" : "Run started"}
						value={props.runStartedAt ?? "-"}
					/>
					<RecordStatRow
						label={cold ? "Last miss" : "Last hit"}
						value={
							lastCall ? (
								<VStack gap="0.5" alignItems="flex-end">
									<span>{pickSummary(lastCall)}</span>
									<span
										className={css({
											fontSize: "xs",
											fontWeight: "normal",
											color: "fg.subtle",
										})}
									>
										{questionTitleWithGame(
											lastCall.question.title,
											lastCall.question.game,
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
			<Card.Footer>{props.footer}</Card.Footer>
		</Card>
	)
}
