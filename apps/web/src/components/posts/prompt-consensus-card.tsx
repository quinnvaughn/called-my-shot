// A prompt's consensus Rushmore: the four players on the most answers, the
// share of answers each is on, how many answers there are, and the way in to
// making (or seeing) the viewer's own. Shown on a team's space and at the top
// of the prompt's page.
import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { button } from "#/components/ui/button"
import { promptPageQuery } from "#/graphql/posts/queries"
import { pluralize } from "#/lib/pluralize"
import { MakeYoursButton } from "./make-yours-button"
import { RushmoreBand } from "./rushmore-band/rushmore-band"

export function PromptConsensusCard({
	code,
	showTitle = true,
}: {
	code: string
	// Off on the prompt's own page, whose heading already names it.
	showTitle?: boolean
}) {
	const { data } = useQuery(promptPageQuery(code))
	const prompt = data?.prompt
	if (!prompt) return null

	const count = prompt.answerCount
	const slots = [0, 1, 2, 3].map((i) => {
		const pick = prompt.consensus[i]
		return pick
			? {
					key: pick.player.id,
					player: pick.player,
					sub: `${pick.sharePercent}%`,
				}
			: { key: `open-${i}`, player: null }
	})

	return (
		<RushmoreBand
			color={prompt.color}
			header={
				<HStack
					justify="space-between"
					gap="3"
					alignItems="flex-end"
					flexWrap="wrap"
				>
					<VStack gap="1" alignItems="stretch" minWidth="0">
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
								? "No Rushmores yet"
								: `The crowd's four · ${count} ${pluralize(count, "Rushmore")}`}
						</span>
						{showTitle && (
							<Link
								to="/rushmore/$code"
								params={{ code: prompt.code }}
								className={css({
									fontFamily: "heading",
									fontSize: { base: "2xl", md: "3xl" },
									lineHeight: "1.05",
									overflowWrap: "anywhere",
									_hover: { textDecoration: "underline" },
								})}
							>
								{prompt.title}
							</Link>
						)}
					</VStack>
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
							code={prompt.code}
							label={count === 0 ? "Make the first" : "Make yours"}
						/>
					)}
				</HStack>
			}
			slots={slots}
		/>
	)
}
