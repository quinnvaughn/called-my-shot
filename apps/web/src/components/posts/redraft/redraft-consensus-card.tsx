import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { css } from "styled-system/css"
import { HStack } from "styled-system/jsx"
import { button } from "#/components/ui/button"
import { redraftPromptPageQuery } from "#/graphql/posts/queries"
import { pluralize } from "#/lib/pluralize"
import { MakeYoursButton } from "../make-yours-button"
import { RedraftBoard } from "./redraft-board"
import { RedraftRow } from "./redraft-row"

// A class's crowd redraft at its default length: slot by slot, the player
// the most public redrafts put there, and where they really went. Before
// anyone has redrafted it, the real draft in its place, so there's something
// to argue with. With the way in to making (or seeing) the viewer's own.
export function RedraftConsensusCard({ code }: { code: string }) {
	const { data } = useQuery(redraftPromptPageQuery(code))
	const prompt = data?.redraftPrompt
	if (!prompt) return null

	const count = prompt.answerCount
	const length = prompt.lengths.find((l) => l.isDefault) ?? prompt.lengths[0]
	const slots = prompt.slots.slice(0, length?.count ?? prompt.slots.length)
	const logoAt = (slot: number) => slots[slot - 1]?.team?.logoUrl ?? null
	const nameAt = (slot: number) => slots[slot - 1]?.teamName ?? null

	return (
		<RedraftBoard
			color={prompt.color}
			header={
				<HStack
					justify="space-between"
					gap="3"
					alignItems="flex-end"
					flexWrap="wrap"
				>
					<span
						className={css({
							fontFamily: "mono",
							fontSize: "xs",
							letterSpacing: "wider",
							textTransform: "uppercase",
							opacity: 0.85,
						})}
					>
						{count === 0
							? `No redrafts yet · the real ${length?.label.toLowerCase() ?? "draft"}`
							: `The crowd's ${length?.label.toLowerCase() ?? "redraft"} · ${count} ${pluralize(count, "redraft")}`}
					</span>
					{prompt.viewerAnswer ? (
						<Link
							to="/posts/$postId"
							params={{ postId: prompt.viewerAnswer.id }}
							className={button({ variant: "outline" })}
						>
							View yours
						</Link>
					) : (
						<MakeYoursButton
							kind="redraft"
							code={prompt.code}
							label={count === 0 ? "Redraft it first" : "Make yours"}
						/>
					)}
				</HStack>
			}
			rows={(palette) =>
				count === 0
					? slots.map((slot) => (
							<RedraftRow
								key={slot.slot}
								slot={slot.slot}
								palette={palette}
								player={{ name: slot.playerName }}
								teamLogoUrl={slot.team?.logoUrl ?? null}
								teamName={slot.teamName}
								original={slot.slot}
								showMove={false}
								showFace={false}
							/>
						))
					: prompt.consensus.map((pick) => (
							<RedraftRow
								key={pick.slot}
								slot={pick.slot}
								palette={palette}
								player={pick.player}
								teamLogoUrl={logoAt(pick.slot)}
								teamName={nameAt(pick.slot)}
								original={pick.originalOverall}
								sub={
									<span
										className={css({
											flexShrink: 0,
											fontSize: "xs",
											opacity: 0.75,
										})}
										title={`${pick.sharePercent}% of public redrafts that reach pick ${pick.slot} take this player there`}
									>
										{pick.sharePercent}%
									</span>
								}
							/>
						))
			}
		/>
	)
}
