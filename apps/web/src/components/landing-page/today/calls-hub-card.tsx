import { useMemo, useState } from "react"
import { css } from "styled-system/css"
import {
	type GuestPickCandidate,
	guestPickLeagues,
} from "../guest-picks/select-guest-picks"

// Calls as one of the landing page's things to play today, shaped like the
// arcade hub cards beside it. Calls have no color of their own, so it's a
// plain surface. It jumps to the try-a-call stack further down the page.
export function CallsHubCard({
	questions,
}: {
	questions: GuestPickCandidate[]
}) {
	// Frozen at mount, as the stack it points at does.
	const [now] = useState(() => Date.now())
	const leagues = useMemo(
		() => guestPickLeagues(questions, now),
		[questions, now],
	)

	return (
		<a
			href="#calls"
			className={css({
				display: "flex",
				flexDirection: "column",
				gap: "4",
				padding: { base: "5", md: "6" },
				borderRadius: "2xl",
				bg: "bg.surface",
				border: "1px solid {colors.border.default}",
				color: "fg.default",
				transition: "transform 0.15s ease",
				_hover: { transform: "translateY(-2px)" },
			})}
		>
			<div
				className={css({
					display: "flex",
					justifyContent: "space-between",
					gap: "3",
					textStyle: "label",
					fontWeight: "bold",
				})}
			>
				<span>Real games</span>
				{leagues.length > 0 && (
					<span>{leagues.map((l) => l.abbreviation).join(" · ")}</span>
				)}
			</div>
			<h2
				className={css({
					fontFamily: "heading",
					fontSize: { base: "3xl", md: "4xl" },
					lineHeight: "1",
				})}
			>
				Calls
			</h2>
			<p className={css({ fontSize: "sm", fontWeight: "medium" })}>
				Pick a side on an upcoming game and set your conviction. The surer you
				are, the more a hit pays and the more a miss costs.
			</p>
			<span
				className={css({
					marginTop: "auto",
					alignSelf: "flex-end",
					fontFamily: "heading",
					fontSize: "lg",
				})}
			>
				{leagues.length > 0 ? "Try one" : "No games to call right now"}
			</span>
		</a>
	)
}
