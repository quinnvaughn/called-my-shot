import { css } from "styled-system/css"
import { match } from "ts-pattern"
import { DarePanel } from "#/components/ui/dare-panel"
import { SendToFriendsRow } from "#/components/ui/send-to-friends-row"
import type { ShareMethod } from "#/lib/share-links"
import { ARCADE_GAME_INFO, type ArcadeGameKey } from "./arcade-game-info"

// The dare at the end of an arcade game: whether the player's friends can
// beat their result, why they can (everyone gets the same puzzle that day),
// and the link, whose preview is the squares.
export function ArcadeShareRow({
	game,
	dare,
	url,
	title,
	tweetText,
	onShared,
}: {
	game: ArcadeGameKey
	// The question put to the player's friends: "Can your friends beat 5
	// guesses?"
	dare: string
	url: string
	title: string
	tweetText: string
	onShared: (method: ShareMethod) => void
}) {
	return (
		<div
			className={css({
				paddingTop: "4",
				borderTop: "1px solid {colors.border.default}",
			})}
		>
			<DarePanel
				dare={dare}
				why={match(game)
					.with(
						"season",
						() =>
							"Everyone gets the same season today. Send them your squares.",
					)
					.with(
						"rank",
						() => "Everyone ranks the same list today. Send them your squares.",
					)
					.with(
						"chain",
						() =>
							"Everyone connects the same two players today. Send them your link and see whose route is shorter.",
					)
					.with(
						"watch",
						() =>
							"Everyone gets the same questions until the team plays again. Send them your link and see who was really watching.",
					)
					.exhaustive()}
			>
				<SendToFriendsRow
					url={url}
					campaign={ARCADE_GAME_INFO[game].campaign}
					title={title}
					tweetText={tweetText}
					onShared={onShared}
				/>
			</DarePanel>
		</div>
	)
}
