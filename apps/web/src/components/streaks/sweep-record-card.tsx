import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { Avatar } from "#/components/ui/avatar"
import { Brand } from "#/components/ui/brand"
import { Card } from "#/components/ui/card"
import { Eyebrow } from "#/components/ui/eyebrow"
import { type FragmentType, graphql, useFragment } from "#/graphql/generated"
import { formatRecord, formatSignedPoints } from "#/lib/ballot-entry"
import { RecordStatRow } from "./record-stat-row"

export const SweepRecordCardCallFragment = graphql(`
	fragment SweepRecordCard_call on Call {
		id
		selections {
			id
			option {
				id
				team {
					id
				}
			}
		}
		question {
			id
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
	}
`)

type Props = {
	leagueAbbr: string
	// "Week 3 Sunday Early", "Sep 14"
	slateLabel: string
	name: string
	username: string
	avatarUrl: string | null
	gameCount: number
	// Null until every swept call's points are final.
	points: number | null
	// See formatSlateDates.
	dates: string
	multiDay: boolean
	// One per counted game, in kickoff order.
	calls: FragmentType<typeof SweepRecordCardCallFragment>[]
}

// The centrepiece of a sweep page, stating the same facts as its og:image
// (apps/api's share-cards/sweep-card.ts): every game with the side taken,
// the record, the points and the dates.
export function SweepRecordCard(props: Props) {
	const calls = useFragment(SweepRecordCardCallFragment, props.calls)
	const n = props.gameCount

	return (
		<Card size="md">
			<Card.Header>
				<VStack gap="4" alignItems="center" width="full">
					<Brand size="sm" />
					<VStack gap="1.5" alignItems="center">
						<Eyebrow size="sm" variant="neutral">
							{props.leagueAbbr} · {props.slateLabel} sweep
						</Eyebrow>
						<span
							className={css({
								fontFamily: "heading",
								fontSize: "5xl",
								lineHeight: "1",
							})}
						>
							{n} for {n}
						</span>
					</VStack>
					{/* Wraps rather than truncating, so a 15-game day shows all 15. */}
					<HStack gap="1.5" flexWrap="wrap" justify="center">
						{calls.map((call) => {
							const game = call.question.game
							if (!game) return null
							const pickedTeamId = call.selections[0]?.option.team?.id
							return (
								<HStack
									key={call.id}
									gap="1"
									className={css({
										fontFamily: "mono",
										fontSize: "2xs",
										paddingBlock: "1",
										paddingInline: "1.5",
										borderRadius: "md",
										border: "1px solid {colors.border.default}",
										bg: "bg.subtle",
									})}
								>
									<ChipTeam
										abbr={game.awayTeam.abbreviation}
										picked={pickedTeamId === game.awayTeam.id}
									/>
									<span className={css({ color: "fg.muted" })}>@</span>
									<ChipTeam
										abbr={game.homeTeam.abbreviation}
										picked={pickedTeamId === game.homeTeam.id}
									/>
								</HStack>
							)
						})}
					</HStack>
					<HStack gap="2" alignItems="center">
						<Avatar size="xs" name={props.name} src={props.avatarUrl} />
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
					<RecordStatRow label="Games" value={String(n)} />
					<RecordStatRow label="Record" value={formatRecord(n, 0)} />
					{props.points !== null && (
						<RecordStatRow
							label="Points"
							value={
								<span className={css({ color: "success.default" })}>
									{formatSignedPoints(props.points)} pts
								</span>
							}
						/>
					)}
					<RecordStatRow
						label={props.multiDay ? "Dates" : "Date"}
						value={props.dates}
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
					<span>
						{props.leagueAbbr} · {props.slateLabel}
					</span>
				</HStack>
			</Card.Footer>
		</Card>
	)
}

function ChipTeam({ abbr, picked }: { abbr: string; picked: boolean }) {
	return (
		<span
			className={css({
				paddingInline: "1",
				borderRadius: "sm",
				fontWeight: picked ? "bold" : "normal",
				color: picked ? "secondary.default" : "fg.muted",
				bg: picked ? "secondary.subtle" : "transparent",
			})}
		>
			{abbr}
		</span>
	)
}
