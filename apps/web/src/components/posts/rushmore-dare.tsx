import { Card } from "#/components/ui/card"
import { DarePanel } from "#/components/ui/dare-panel"
import { SendToFriendsRow } from "#/components/ui/send-to-friends-row"
import { track } from "#/lib/analytics"
import { SITE_ORIGIN } from "#/lib/meta"
import { rushmoreHook } from "#/lib/post-hook"
import { ShareImageButton } from "./share-image-button"

type Props = {
	postId: string
	// /rushmore/{prompt}/{author}.
	path: string
	promptTitle: string
	answerCount: number
	// Left to right.
	picks: { sharePercent: number; player: { name: string } }[]
}

// On the author's own public Rushmore: the pick fewest people made, as the
// reason to send it, and the buttons that do. Whoever opens the link gets
// Make yours.
export function RushmoreDare({
	postId,
	path,
	promptTitle,
	answerCount,
	picks,
}: Props) {
	const hook = rushmoreHook(picks, answerCount)
	const subject = `My Mount Rushmore: ${promptTitle}`
	const names = picks.map((pick) => pick.player.name).join(", ")
	return (
		<Card>
			<Card.Body>
				<DarePanel
					dare={hook ?? "Who'd pick a different four?"}
					why={
						hook
							? "Send it to the people who'll tell you you're wrong. Your link lets them make their own."
							: "Send it to them. Your link lets them make their own."
					}
				>
					<SendToFriendsRow
						url={`${SITE_ORIGIN}${path}`}
						campaign="rushmore"
						title={subject}
						tweetText={`${subject}: ${names}.${hook ? ` ${hook}` : ""} Who are yours?`}
						onShared={(method) =>
							track("rushmore_link_shared", { postId, own: true, method })
						}
					>
						<ShareImageButton
							imagePath={`/share/rushmore/${encodeURIComponent(postId)}/portrait`}
							fileName={`${promptTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.png`}
						/>
					</SendToFriendsRow>
				</DarePanel>
			</Card.Body>
		</Card>
	)
}
