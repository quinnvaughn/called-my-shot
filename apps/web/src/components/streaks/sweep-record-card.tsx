import { Link } from "@tanstack/react-router"
import type { ReactNode } from "react"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { Avatar } from "#/components/ui/avatar"
import { Card } from "#/components/ui/card"
import { Eyebrow } from "#/components/ui/eyebrow"
import { type FragmentType, graphql, useFragment } from "#/graphql/generated"
import { PointsTotal } from "./points-total"

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
	name: string
	username: string
	avatarUrl: string | null
	gameCount: number
	// Null until every swept call's points are final.
	points: number | null
	// The sweep's own award, on top of the calls' points.
	bonus: number
	// See formatSlateDates.
	dates: string
	// One per counted game, in kickoff order.
	calls: FragmentType<typeof SweepRecordCardCallFragment>[]
	// Where to go from here and the ways of sending the sweep on, owned by
	// the page, which knows the viewer.
	footer: ReactNode
}

// The centrepiece of a sweep page, laid out like CallRecordCard: whose sweep
// it is, the result at the pick's scale with every game and the side taken,
// then its points. No status tag: a sweep only exists once it's settled. The
// slate is the page's title above, so the card doesn't repeat it.
export function SweepRecordCard(props: Props) {
	const calls = useFragment(SweepRecordCardCallFragment, props.calls)
	const n = props.gameCount

	return (
		<Card size="md">
			<Card.Header>
				<VStack gap="4" alignItems="stretch" width="full">
					{/* Who and when, the same row CallRecordCard opens with. */}
					<HStack gap="2" alignItems="center" minWidth="0">
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
						<span
							className={css({
								flexShrink: "0",
								fontFamily: "mono",
								fontSize: "xs",
								color: "fg.muted",
								whiteSpace: "nowrap",
							})}
						>
							· {props.dates}
						</span>
					</HStack>
					<VStack gap="3" alignItems="flex-start">
						<Eyebrow size="sm" variant="neutral">
							Every winner called
						</Eyebrow>
						<span
							className={css({
								fontFamily: "heading",
								fontSize: { base: "2xl", sm: "3xl" },
								lineHeight: "1.15",
							})}
						>
							{n} for {n}
						</span>
						{/* Wraps rather than truncating, so a 15-game day shows all 15. */}
						<HStack gap="1.5" flexWrap="wrap">
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
						{props.points !== null && (
							<PointsTotal
								callPoints={props.points}
								bonus={props.bonus}
								bonusLabel="sweep bonus"
								label="Points"
							/>
						)}
					</VStack>
				</VStack>
			</Card.Header>
			<Card.Footer>{props.footer}</Card.Footer>
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
