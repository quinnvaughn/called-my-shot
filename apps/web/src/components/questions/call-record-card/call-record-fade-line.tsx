import { Link } from "@tanstack/react-router"
import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import { match } from "ts-pattern"
import type { CallRecordCardData } from "./types"

// The fade this call is, under the question: whose call it was aimed at, then
// once it settles how it went and the winner's line, written on the card
// where the loser's own record shows it.
export function CallRecordFadeLine({
	fading,
}: {
	fading: NonNullable<CallRecordCardData["fading"]>
}) {
	const outcome = match(fading.outcome)
		.with("won", () => ({
			text: `Cashed against @${fading.username}`,
			tone: "success" as const,
		}))
		.with("lost", () => ({
			text: `Lost the fade to @${fading.username}`,
			tone: "danger" as const,
		}))
		.with("flipped", () => ({
			text: `@${fading.username} switched to this side after the fade`,
			tone: "neutral" as const,
		}))
		.with(null, () => null)
		.exhaustive()

	return (
		<VStack gap="2" alignItems="flex-start" paddingTop="1">
			<Link
				to="/calls/$callId"
				params={{ callId: fading.callId }}
				className={css({
					textStyle: "sectionHeading",
					fontWeight: "bold",
					textDecoration: "none",
					color: "primary.default",
					border: "1px solid {colors.primary.default}",
					borderRadius: "sm",
					paddingBlock: "1",
					paddingInline: "2.5",
					_hover: { opacity: 0.8 },
				})}
			>
				{fading.settled ? "Faded" : "Fading"} @{fading.username} →
			</Link>
			{outcome && (
				<span
					className={css({
						textStyle: "sectionHeading",
						color:
							outcome.tone === "success"
								? "success.default"
								: outcome.tone === "danger"
									? "danger.default"
									: "fg.muted",
					})}
				>
					{outcome.text}
				</span>
			)}
			{fading.gloat && (
				<p
					className={css({
						fontSize: "md",
						color: "fg.default",
					})}
				>
					<Link
						to="/user/$username"
						params={{ username: fading.gloat.username }}
						className={css({
							fontWeight: "bold",
							color: "fg.default",
							textDecoration: "underline",
							textUnderlineOffset: "3px",
							_hover: { color: "fg.muted" },
						})}
					>
						@{fading.gloat.username}
					</Link>
					: "{fading.gloat.text}"
				</p>
			)}
		</VStack>
	)
}
