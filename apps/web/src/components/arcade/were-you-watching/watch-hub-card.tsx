import { Link } from "@tanstack/react-router"
import { css } from "styled-system/css"

// Were You Watching? on the Arcade hub, in the game's color. Every team has
// its own quiz, so the card leads to picking one.
export function WatchHubCard() {
	return (
		<Link
			to="/arcade/were-you-watching"
			className={css({
				display: "flex",
				flexDirection: "column",
				gap: "4",
				padding: { base: "5", md: "6" },
				borderRadius: "2xl",
				bg: "watch.default",
				color: "watch.ink",
				transition: "transform 0.15s ease",
				_hover: { transform: "translateY(-2px)" },
			})}
		>
			<span className={css({ textStyle: "label", fontWeight: "bold" })}>
				After every game
			</span>
			<h2
				className={css({
					fontFamily: "heading",
					fontSize: { base: "3xl", md: "4xl" },
					lineHeight: "1",
				})}
			>
				Were You Watching?
			</h2>
			<p className={css({ fontSize: "sm", fontWeight: "medium" })}>
				Pick a team and get questions on its last game, straight from the box
				score. Four choices, 10 seconds each.
			</p>
			<span
				className={css({
					alignSelf: "flex-end",
					marginTop: "auto",
					fontFamily: "heading",
					fontSize: "lg",
				})}
			>
				Pick your team
			</span>
		</Link>
	)
}
