import { Card } from "#/components/ui/card"
import { DarePanel } from "#/components/ui/dare-panel"
import { SendToFriendsRow } from "#/components/ui/send-to-friends-row"
import { track } from "#/lib/analytics"
import { SITE_ORIGIN } from "#/lib/meta"
import { redraftHook } from "#/lib/post-hook"
import { surname } from "#/lib/shared-picks"
import { ShareImageButton } from "../share-image-button"

type Props = {
	postId: string
	// /redraft/{class}/{author}.
	path: string
	// "2003 NBA Draft".
	classTitle: string
	answerCount: number
	// Slot order.
	picks: { slot: number; sharePercent: number; player: { name: string } }[]
}

// How many picks the posted text names before it trails off.
const NAMED = 3

// On the author's own public redraft: the pick fewest people made, as the
// reason to send it, and the buttons that do. Whoever opens the link gets
// Redraft it.
export function RedraftDare({
	postId,
	path,
	classTitle,
	answerCount,
	picks,
}: Props) {
	const hook = redraftHook(picks, answerCount)
	const subject = `My redraft of the ${classTitle}`
	const top = picks
		.slice(0, NAMED)
		.map((pick) => `${pick.slot}. ${surname(pick.player.name)}`)
		.join(", ")
	return (
		<Card>
			<Card.Body>
				<DarePanel
					dare={hook ?? "Who'd draft it different?"}
					why={
						hook
							? "Send it to the people who'll tell you you're wrong. Your link lets them redraft it themselves."
							: "Send it to them. Your link lets them redraft it themselves."
					}
				>
					<SendToFriendsRow
						url={`${SITE_ORIGIN}${path}`}
						campaign="redraft"
						title={subject}
						tweetText={`${subject}: ${top}${picks.length > NAMED ? "…" : "."}${hook ? ` ${hook}` : ""} Who would you take?`}
						onShared={(method) =>
							track("redraft_link_shared", { postId, own: true, method })
						}
					>
						<ShareImageButton
							imagePath={`/share/redraft/${encodeURIComponent(postId)}/portrait`}
							fileName={`${classTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-redraft.png`}
						/>
					</SendToFriendsRow>
				</DarePanel>
			</Card.Body>
		</Card>
	)
}
