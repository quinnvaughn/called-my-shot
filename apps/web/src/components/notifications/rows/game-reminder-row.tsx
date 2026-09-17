import { DateTime } from "luxon"
import { FiBell } from "react-icons/fi"
import { css } from "styled-system/css"
import { type FragmentType, graphql, useFragment } from "#/graphql/generated"
import { buildGameSlug } from "#/lib/slug"
import { NotificationShell, type Target } from "../notification-shell"

export const GameReminderRowFragment = graphql(`
	fragment GameReminderRow_notification on GameReminderNotification {
		id
		createdAt
		game {
			id
			startsAt
			league {
				slug
			}
			homeTeam {
				name
				abbreviation
			}
			awayTeam {
				name
				abbreviation
			}
		}
	}
`)

type Props = {
	notification: FragmentType<typeof GameReminderRowFragment>
	unread: boolean
	onOpen: (id: string) => void
}

// Sent an hour before a game the viewer set a reminder on - see
// drainGameReminders on the api. The same batch also goes out as one email.
export function GameReminderRow({
	notification: notificationProp,
	unread,
	onOpen,
}: Props) {
	const n = useFragment(GameReminderRowFragment, notificationProp)
	const game = n.game
	const target: Target = game
		? {
				to: "/games/$gameId/{-$slug}",
				params: { gameId: game.id, slug: buildGameSlug(game) },
			}
		: null

	return (
		<NotificationShell
			id={n.id}
			unread={unread}
			createdAt={n.createdAt}
			icon={FiBell}
			target={target}
			onOpen={onOpen}
		>
			<p className={css({ fontSize: "sm" })}>
				{game
					? `${game.awayTeam.abbreviation} @ ${game.homeTeam.abbreviation} starts at ${DateTime.fromISO(game.startsAt).toFormat("h:mm a")}. Check who's starting before calls lock.`
					: "A game you set a reminder for is about to start."}
			</p>
		</NotificationShell>
	)
}
