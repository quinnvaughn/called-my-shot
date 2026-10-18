import type { ReactNode } from "react"
import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import { match } from "ts-pattern"
import type { UserCardData } from "#/components/users/user-card"
import { UserHandle } from "#/components/users/user-handle"
import type { ChainPageQuery } from "#/graphql/generated/graphql"
import {
	chanceLabel,
	linkMatchup,
	linkPick,
	multiplierLabel,
} from "#/lib/chains"
import { formatTimeAgo } from "#/lib/format-date"
import { toIdentity } from "#/lib/identity"

export type ChainEventData = NonNullable<
	ChainPageQuery["chain"]
>["events"][number]

function Handle({ user }: { user: UserCardData | null | undefined }) {
	return user ? <UserHandle user={user} /> : <>Someone</>
}

const links = (count: number | null) =>
	count === 1 ? "1 link" : `${count ?? 0} links`

// The sentence an event is told in. Each one states what changed.
function eventLine(event: ChainEventData): ReactNode {
	const actor = <Handle user={event.actor} />
	const owner = (
		<Handle user={event.link?.user ? toIdentity(event.link.user) : null} />
	)
	return match(event.kind)
		.with("STARTED", () => <>{actor} started the chain.</>)
		.with("JOINED", () => (
			<>
				{actor} is in. The chain is {links(event.linkCount)}.
			</>
		))
		.with("DECLINED", () => (
			<>
				{actor} turned down {owner}'s link.
			</>
		))
		.with("LEFT", () => (
			<>
				{actor} left the chain. It's {links(event.linkCount)}.
			</>
		))
		.with("CALLED_OFF", () => <>{actor} called off the chain.</>)
		.with("LOCKED", () =>
			(event.linkCount ?? 0) < 2
				? "Locked with 1 link, so it doesn't count."
				: `Locked with ${links(event.linkCount)}.`,
		)
		.with("LINK_HIT", () => <>{owner}'s link hit.</>)
		.with("LINK_MISSED", () => <>{owner}'s link missed.</>)
		.with("BROKEN", () => (
			<>
				{actor} broke the chain.
				{event.zeroedCount
					? ` ${event.zeroedCount === 1 ? "1 hit" : `${event.zeroedCount} hits`} zeroed.`
					: ""}
			</>
		))
		.with("HELD", () => "The chain held. Every link hit.")
		.exhaustive()
}

// What it did to the viewer's own multiplier, when it moved it.
function viewerLine(event: ChainEventData): string | null {
	if (event.viewerMultiplier === null) return null
	if (event.kind === "LOCKED") {
		return `If it holds, you're at ${multiplierLabel(event.viewerMultiplier)}.`
	}
	if (event.previousViewerMultiplier === null) return null
	const from = multiplierLabel(event.previousViewerMultiplier)
	const to = multiplierLabel(event.viewerMultiplier)
	return event.viewerMultiplier > event.previousViewerMultiplier
		? `Your multiplier goes from ${from} to ${to}.`
		: `Your multiplier drops from ${from} to ${to}.`
}

// Something that happened to the chain.
export function ChainEventRow({ event }: { event: ChainEventData }) {
	const showsPick =
		event.link &&
		(event.kind === "STARTED" ||
			event.kind === "JOINED" ||
			event.kind === "DECLINED")
	const pick = event.link ? linkPick(event.link) : null
	const matchup = event.link ? linkMatchup(event.link) : null
	const mine = viewerLine(event)
	return (
		<VStack
			gap="1"
			alignItems="stretch"
			className={css({
				paddingInline: "3",
				paddingBlock: "2",
				borderLeft:
					event.kind === "BROKEN"
						? "1px solid {colors.danger.default}"
						: event.kind === "HELD"
							? "1px solid {colors.success.default}"
							: "1px solid {colors.border.default}",
			})}
		>
			<span className={css({ fontSize: "sm" })}>{eventLine(event)}</span>
			{showsPick && event.link && (
				<span className={css({ textStyle: "meta", color: "fg.muted" })}>
					{[pick, matchup, chanceLabel(event.link.hitChance)]
						.filter(Boolean)
						.join(" · ")}
				</span>
			)}
			{mine && (
				<span className={css({ fontSize: "sm", color: "secondary.default" })}>
					{mine}
				</span>
			)}
			<span className={css({ textStyle: "meta", color: "fg.subtle" })}>
				{formatTimeAgo(event.at)}
			</span>
		</VStack>
	)
}
