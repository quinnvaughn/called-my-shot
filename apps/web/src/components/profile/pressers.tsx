import { Link } from "@tanstack/react-router"
import type { ReactNode } from "react"
import { FiMic } from "react-icons/fi"
import { css, cx } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import {
	marginMark,
	presserBodyText,
	presserEyebrow,
	transcriptRow,
} from "#/components/pressers/presser-qa-item"
import { closesInLabel } from "#/components/pressers/presser-result"
import { Card } from "#/components/ui/card"
import { Tag } from "#/components/ui/tag"
import { type FragmentType, graphql, useFragment } from "#/graphql/generated"
import { formatCallDate } from "#/lib/format-date"
import { pluralize } from "#/lib/pluralize"

export const ProfilePresserFragment = graphql(`
	fragment ProfilePresser_presser on Presser {
		id
		isOpen
		closesAt
		statement
		answeredCount
		game {
			id
			startsAt
			league {
				id
			}
			homeTeam {
				abbreviation
			}
			awayTeam {
				abbreviation
			}
		}
		latestAnswer {
			id
			body
			answer
			noComment
		}
	}
`)

export type ProfilePresserRef = FragmentType<typeof ProfilePresserFragment>

const matchupOf = (game: {
	homeTeam: { abbreviation: string }
	awayTeam: { abbreviation: string }
}) => `${game.awayTeam.abbreviation} @ ${game.homeTeam.abbreviation}`

const clamp = css({ lineClamp: 2 })

// Under the profile header while they have a presser taking questions: where
// to go to ask one, or, on their own profile, to answer. The newest game's
// presser, with how many more are open.
export function OpenPresserBanner({
	username,
	isOwn,
	pressers: pressersProp,
}: {
	username: string
	isOwn: boolean
	pressers: ProfilePresserRef[]
}) {
	const pressers = useFragment(ProfilePresserFragment, pressersProp)
	const [newest] = pressers
	if (!newest) return null
	const more = pressers.length - 1

	return (
		<Link
			to="/games/$gameId/picks/$username"
			params={{ gameId: newest.game.id, username }}
			hash="presser"
			className={css({
				display: "block",
				textDecoration: "none",
				color: "inherit",
			})}
		>
			<Card size="sm" interactive>
				<Card.Body>
					<HStack justify="space-between" gap="3" flexWrap="wrap">
						<HStack gap="2.5" minWidth="0">
							<FiMic
								size={16}
								aria-hidden
								className={css({ color: "secondary.default", flexShrink: 0 })}
							/>
							<VStack gap="0.5" alignItems="flex-start" minWidth="0">
								<span
									className={css({ fontSize: "sm", fontWeight: "semibold" })}
								>
									{isOwn ? "Your presser is open" : "Taking questions"} on{" "}
									{matchupOf(newest.game)}
									{more > 0 ? ` and ${more} more` : ""}
								</span>
								<span className={presserEyebrow}>
									{closesInLabel(newest.closesAt)}
								</span>
							</VStack>
						</HStack>
						<span
							className={css({
								fontFamily: "mono",
								fontSize: "2xs",
								letterSpacing: "wide",
								textTransform: "uppercase",
								color: "primary.default",
								whiteSpace: "nowrap",
							})}
						>
							{isOwn ? "Answer questions →" : "Ask a question →"}
						</span>
					</HStack>
				</Card.Body>
			</Card>
		</Link>
	)
}

// Every presser with something public in it, newest game first: the
// statement, or the latest answer as a transcript.
export function PressersSection({
	heading,
	username,
	pressers: pressersProp,
	leagueId,
}: {
	// Drawn only when there's a presser to list under it.
	heading: ReactNode
	username: string
	pressers: ProfilePresserRef[]
	// Set when the profile is scoped to one league.
	leagueId: string | null
}) {
	const pressers = useFragment(ProfilePresserFragment, pressersProp).filter(
		(p) => !leagueId || p.game.league.id === leagueId,
	)
	if (pressers.length === 0) return null

	return (
		<VStack alignItems="stretch" gap="3">
			{heading}
			<VStack alignItems="stretch" gap="2">
				{pressers.map((p) => {
					const q = p.latestAnswer
					return (
						<Link
							key={p.id}
							to="/games/$gameId/picks/$username"
							params={{ gameId: p.game.id, username }}
							hash="presser"
							className={css({
								display: "block",
								textDecoration: "none",
								color: "inherit",
							})}
						>
							<Card size="sm" interactive>
								<Card.Body>
									<VStack gap="2.5" alignItems="stretch">
										<HStack justify="space-between" gap="3">
											<HStack gap="2" minWidth="0">
												<span
													className={css({
														fontSize: "sm",
														fontWeight: "semibold",
													})}
												>
													{matchupOf(p.game)}
												</span>
												<span className={presserEyebrow}>
													{formatCallDate(p.game.startsAt)}
												</span>
											</HStack>
											{p.isOpen ? (
												<Tag size="sm" variant="secondary">
													Open
												</Tag>
											) : (
												<span className={presserEyebrow}>
													{p.answeredCount}{" "}
													{pluralize(p.answeredCount, "answer")}
												</span>
											)}
										</HStack>
										{q ? (
											<VStack gap="1.5" alignItems="stretch">
												<div className={transcriptRow}>
													<span aria-hidden className={marginMark}>
														Q
													</span>
													<p
														className={cx(
															css({ fontSize: "sm", fontWeight: "semibold" }),
															clamp,
														)}
													>
														{q.body}
													</p>
												</div>
												<div className={transcriptRow}>
													<span aria-hidden className={marginMark}>
														A
													</span>
													<p className={cx(presserBodyText, clamp)}>
														{q.noComment ? "No comment." : q.answer}
													</p>
												</div>
											</VStack>
										) : (
											p.statement && (
												<p className={cx(presserBodyText, clamp)}>
													{p.statement}
												</p>
											)
										)}
									</VStack>
								</Card.Body>
							</Card>
						</Link>
					)
				})}
			</VStack>
		</VStack>
	)
}
