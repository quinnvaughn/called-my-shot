import { Link } from "@tanstack/react-router"
import { css, cx } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import {
	marginMark,
	presserBodyText,
	presserEyebrow,
	transcriptRow,
} from "#/components/pressers/presser-qa-item"
import { Card } from "#/components/ui/card"
import { Tag } from "#/components/ui/tag"
import type { ProfilePresser_PresserFragment } from "#/graphql/generated/graphql"
import { formatCallDate } from "#/lib/format-date"
import { matchupLabel } from "#/lib/game-status"
import { pluralize } from "#/lib/pluralize"

const clamp = css({ lineClamp: 2 })

export function PresserCard({
	presser: p,
	username,
}: {
	presser: ProfilePresser_PresserFragment
	username: string
}) {
	const q = p.latestAnswer
	return (
		<Link
			to="/games/$gameId/picks/$username"
			params={{ gameId: p.game.id, username }}
			hash="presser"
			className={css({
				display: "block",
				height: "full",
				textDecoration: "none",
				color: "inherit",
			})}
		>
			{/* Full height so every card in the phone rail matches the tallest. */}
			<Card size="sm" interactive className={css({ height: "full" })}>
				<Card.Body>
					<VStack gap="2.5" alignItems="stretch">
						<HStack
							justify="space-between"
							gap="3"
							alignItems={{ base: "flex-start", sm: "center" }}
						>
							{/* The date drops under the matchup on a phone, where the
							    rail's card is too narrow for both beside the count. */}
							<div
								className={css({
									display: "flex",
									flexDirection: { base: "column", sm: "row" },
									alignItems: { base: "flex-start", sm: "center" },
									gap: { base: "0.5", sm: "2" },
									minWidth: "0",
								})}
							>
								<span
									className={css({
										fontSize: "sm",
										fontWeight: "semibold",
									})}
								>
									{matchupLabel(p.game)}
								</span>
								<span className={presserEyebrow}>
									{formatCallDate(p.game.startsAt)}
								</span>
							</div>
							{p.isOpen ? (
								<Tag size="sm" variant="secondary">
									Open
								</Tag>
							) : (
								<span className={presserEyebrow}>
									{p.answeredCount} {pluralize(p.answeredCount, "answer")}
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
								<p className={cx(presserBodyText, clamp)}>{p.statement}</p>
							)
						)}
					</VStack>
				</Card.Body>
			</Card>
		</Link>
	)
}
