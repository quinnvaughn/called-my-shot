import { OH_FER_GIFS, PERFECT_GIFS } from "@called-my-shot/gifs"
import { css, cx } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import { match } from "ts-pattern"
import { ReactionGif } from "#/components/ui/reaction-gif"
import type { GameEntryVerdict } from "#/graphql/generated/graphql"

// A finished game called all right or all wrong, on its entry page. Set by
// gameEntryVerdict in the api once the game is final and at least five calls
// have settled. Cosmetic: the points already counted every one of them.
export function GameVerdictStamp({ verdict }: { verdict: GameEntryVerdict }) {
	const perfect = verdict === "PERFECT"
	const { label, line, pool } = match(verdict)
		.with("PERFECT", () => ({
			label: "PERFECT CARD",
			line: "Every settled call on this game hit.",
			pool: PERFECT_GIFS,
		}))
		.with("OH_FER", () => ({
			label: "OH-FER",
			line: "Every settled call on this game missed.",
			pool: OH_FER_GIFS,
		}))
		.exhaustive()

	return (
		<VStack gap="3" alignItems="stretch">
			<VStack gap="2" alignItems="center">
				<span
					className={cx(
						css({
							display: "inline-block",
							fontFamily: "mono",
							fontSize: "xl",
							fontWeight: "bold",
							letterSpacing: "widest",
							padding: "{spacing.1} {spacing.3}",
							borderRadius: "sm",
							transform: "rotate(-4deg)",
							animation: "stampDown 0.25s cubic-bezier(0.3, 0, 0.5, 1.4)",
							_motionReduce: { animation: "none" },
						}),
						perfect
							? css({
									color: "success.default",
									border: "2px solid {colors.success.default}",
								})
							: css({
									color: "danger.default",
									border: "2px solid {colors.danger.default}",
								}),
					)}
				>
					{label}
				</span>
				<span className={css({ fontSize: "sm", color: "fg.muted" })}>
					{line}
				</span>
			</VStack>
			<ReactionGif pool={pool} />
		</VStack>
	)
}
