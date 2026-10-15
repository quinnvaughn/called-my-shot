import { Link } from "@tanstack/react-router"
import { FiFlag } from "react-icons/fi"
import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import { ChallengeStatus } from "#/components/challenges/challenge-status"
import { CardRail } from "#/components/ui/card-rail"
import { Identity } from "#/components/ui/identity"
import { type FragmentType, graphql, useFragment } from "#/graphql/generated"
import { pluralize } from "#/lib/pluralize"

export const GroupChallengeStripFragment = graphql(`
	fragment GroupChallengeStrip_challenge on Challenge {
		id
		code
		state
		closesAt
		acceptanceCount
		viewerCanAccept
		creator {
			id
			name
			username
			avatarUrl
		}
		creatorTally {
			wins
			losses
			draws
		}
		entries {
			question {
				id
				title
			}
		}
	}
`)

// Challenges members posted to the group: still open, still playing out, or
// settled in the last week. Renders nothing when there are none.
export function GroupChallengeStrip({
	challenges: challengesProp,
}: {
	challenges: FragmentType<typeof GroupChallengeStripFragment>[]
}) {
	const challenges = useFragment(GroupChallengeStripFragment, challengesProp)
	if (challenges.length === 0) return null

	return (
		<CardRail
			items={challenges}
			getKey={(c) => c.id}
			itemLabel="challenge"
			title="Challenges"
			icon={<FiFlag size={12} aria-hidden />}
			renderItem={(c) => {
				const titles = c.entries.map((e) => e.question.title)
				return (
					<Link
						to="/challenges/$code"
						params={{ code: c.code }}
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
							_hover: { border: "1px solid {colors.border.emphasized}" },
						})}
					>
						<Identity
							name={c.creator.name}
							username={c.creator.username}
							avatarUrl={c.creator.avatarUrl}
						/>
						<VStack gap="1" alignItems="stretch" className={css({ flex: "1" })}>
							<p
								className={css({
									fontSize: "sm",
									fontWeight: "semibold",
									lineClamp: 2,
								})}
							>
								{titles[0]}
								{titles.length > 1 &&
									` + ${titles.length - 1} more ${pluralize(titles.length - 1, "question")}`}
							</p>
							<p
								className={css({
									textStyle: "metaLg",
									color: "fg.muted",
								})}
							>
								<ChallengeStatus
									state={c.state}
									closesAt={c.closesAt}
									acceptanceCount={c.acceptanceCount}
									creator={c.creator}
									tally={c.creatorTally}
								/>
							</p>
						</VStack>
						<span
							className={css({
								textStyle: "label",
								color: "primary.default",
							})}
						>
							{c.viewerCanAccept ? "Take it on →" : "See the challenge →"}
						</span>
					</Link>
				)
			}}
		/>
	)
}
