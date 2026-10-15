import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { Avatar } from "#/components/ui/avatar"
import { useFragment } from "#/graphql/generated"
import { cardFactParts } from "#/lib/card-fact"
import { groupPicksLine } from "#/lib/group-picks"
import {
	GameCardExtrasFragment,
	type GameCardExtrasProps,
} from "./game-card-extras"

const lineClass = css({
	fontSize: "xs",
	color: "fg.muted",
	lineHeight: "snug",
})

// The fact and the group line, stacked. Renders nothing when neither has
// anything to say.
export function GameCardContext({
	question: questionProp,
}: GameCardExtrasProps) {
	const question = useFragment(GameCardExtrasFragment, questionProp)
	const fact = question.cardFact ? cardFactParts(question.cardFact) : null
	const group = groupPicksLine(question.viewerGroupPicks, question.options)
	if (!fact && !group) return null

	return (
		<VStack gap="1.5" alignItems="stretch">
			{fact && (
				<span className={lineClass}>
					{fact.map((part, i) =>
						typeof part === "string" ? (
							part
						) : (
							<span
								// Positional: the parts are a fixed sentence, never reordered.
								// biome-ignore lint/suspicious/noArrayIndexKey: see above
								key={i}
								className={css({
									fontFamily: "mono",
									fontWeight: "semibold",
									color: "secondary.default",
								})}
							>
								{part.figure}
							</span>
						),
					)}
				</span>
			)}
			{group && (
				<HStack gap="2" alignItems="center">
					<Avatar
						name={group.sampleUser.name}
						src={group.sampleUser.avatarUrl}
						size="xs"
					/>
					<span className={lineClass}>{group.text}</span>
				</HStack>
			)}
		</VStack>
	)
}
