import { FiZap } from "react-icons/fi"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { pluralize } from "#/lib/pluralize"

// Below this many guesses, the bar chart is just 1-2 bars at full height -
// technically accurate but reads as far more signal than it actually is.
// Same "be the first" empty-state voice QuestionCallsList already uses for
// the calls list on this same page, just gated on guess volume instead.
export const MIN_GUESSES_FOR_CHART = 5

// A real stat display (count + label + nudge), not a generic <EmptyState>
// line of text - a numeric-guess shape with 0-4 guesses still has a real number
// worth putting on the page, it just isn't enough to plot as a chart yet.
export function LowVolumeGuesses({ totalGuesses }: { totalGuesses: number }) {
	return (
		<VStack
			gap="1"
			alignItems="center"
			className={css({ padding: "5", textAlign: "center" })}
		>
			<span
				className={css({
					fontFamily: "mono",
					fontSize: "2xl",
					color: "fg.default",
				})}
			>
				{totalGuesses}
			</span>
			<span
				className={css({
					textStyle: "labelSm",
					color: "fg.subtle",
				})}
			>
				{pluralize(totalGuesses, "guess", "guesses")} so far
			</span>
			<HStack
				gap="1.5"
				alignItems="center"
				className={css({ paddingTop: "2" })}
			>
				<FiZap size={13} className={css({ color: "primary.default" })} />
				<span
					className={css({
						textStyle: "metaLg",
						color: "primary.default",
					})}
				>
					{totalGuesses === 0
						? "No one's guessed yet - set the tone."
						: `Early days - the spread shows once ${MIN_GUESSES_FOR_CHART} guesses are in.`}
				</span>
			</HStack>
		</VStack>
	)
}
