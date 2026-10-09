import { Link } from "@tanstack/react-router"
import { FiMic } from "react-icons/fi"
import { css, cx } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import {
	marginMark,
	presserBodyText,
	presserEyebrow,
	transcriptRow,
} from "#/components/pressers/presser-qa-item"
import { CardRail } from "#/components/ui/card-rail"
import { Identity } from "#/components/ui/identity"
import { type FragmentType, graphql, useFragment } from "#/graphql/generated"
import { track } from "#/lib/analytics"
import { toIdentity } from "#/lib/identity"
import { pluralize } from "#/lib/pluralize"

export const GroupPresserStripFragment = graphql(`
	fragment GroupPresserStrip_highlight on GroupPresserHighlight {
		id
		presser {
			id
			answeredCount
			owner {
				id
				...Identity_user
			}
			game {
				id
				homeTeam {
					abbreviation
				}
				awayTeam {
					abbreviation
				}
			}
		}
		latestAnswer {
			id
			body
			answer
			noComment
			asker {
				id
				...Identity_user
			}
			call {
				id
				question {
					id
					title
				}
			}
		}
	}
`)

type Props = {
	groupId: string
	viewerId: string | null
	highlights: FragmentType<typeof GroupPresserStripFragment>[]
}

const clamp = css({ lineClamp: 3 })

// Members' pressers answered in the last day and a half, each showing its
// newest answer as a transcript and opening the full presser on the member's
// picks page. Renders nothing when nobody has answered anything lately.
export function GroupPresserStrip({
	groupId,
	viewerId,
	highlights: highlightsProp,
}: Props) {
	const highlights = useFragment(GroupPresserStripFragment, highlightsProp)
	if (highlights.length === 0) return null

	return (
		<CardRail
			items={highlights}
			getKey={(h) => h.id}
			itemLabel="presser"
			header={
				<HStack
					gap="1.5"
					className={css({
						fontFamily: "mono",
						fontSize: "xs",
						letterSpacing: "wide",
						color: "fg.muted",
						textTransform: "uppercase",
					})}
				>
					<FiMic size={12} aria-hidden />
					From the pressers
				</HStack>
			}
			renderItem={(h) => {
				const owner = toIdentity(h.presser.owner)
				const { game } = h.presser
				const q = h.latestAnswer
				const asker = q.asker ? toIdentity(q.asker) : null
				const others = h.presser.answeredCount - 1
				return (
					<Link
						to="/games/$gameId/picks/$username"
						params={{ gameId: game.id, username: owner.username }}
						search={{ group: groupId }}
						hash="presser"
						onClick={() =>
							track("group_presser_strip_clicked", {
								groupId,
								presserId: h.presser.id,
								ownerIsViewer: owner.id === viewerId,
							})
						}
						className={css({
							display: "flex",
							flexDirection: "column",
							gap: "3",
							height: "full",
							padding: "4",
							borderRadius: "xl",
							bg: "bg.surface",
							border: "1px solid {colors.border.default}",
							textDecoration: "none",
							color: "inherit",
							transition: "border-color 0.15s ease",
							_hover: { borderColor: "border.emphasized" },
						})}
					>
						<HStack justify="space-between" gap="3" alignItems="flex-start">
							<Identity
								name={owner.name}
								username={owner.username}
								avatarUrl={owner.avatarUrl}
								flair={owner.flair}
								size="xs"
							/>
							<span className={presserEyebrow}>
								{game.awayTeam.abbreviation} @ {game.homeTeam.abbreviation}
							</span>
						</HStack>
						<VStack gap="2" alignItems="stretch" className={css({ flex: "1" })}>
							<div className={transcriptRow}>
								<span aria-hidden className={marginMark}>
									Q
								</span>
								<VStack gap="0.5" alignItems="flex-start" minWidth="0">
									{asker ? (
										<Identity
											name={asker.name}
											username={asker.username}
											avatarUrl={asker.avatarUrl}
											flair={asker.flair}
											size="xs"
										/>
									) : (
										<span className={presserEyebrow}>
											From their results
											{q.call ? ` · ${q.call.question.title}` : ""}
										</span>
									)}
									<p
										className={cx(
											css({ fontSize: "sm", fontWeight: "semibold" }),
											clamp,
										)}
									>
										{q.body}
									</p>
								</VStack>
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
						<span
							className={css({
								fontFamily: "mono",
								fontSize: "2xs",
								letterSpacing: "wide",
								textTransform: "uppercase",
								color: "primary.default",
							})}
						>
							{others > 0
								? `${others} more ${pluralize(others, "answer")} · Read the presser →`
								: "Read the presser →"}
						</span>
					</Link>
				)
			}}
		/>
	)
}
