import type { StreakMode } from "@called-my-shot/scoring"
import { Link } from "@tanstack/react-router"
import { type ReactNode, useEffect, useRef } from "react"
import type { IconType } from "react-icons/lib"
import { css } from "styled-system/css"
import { HStack } from "styled-system/jsx"
import { Card } from "#/components/ui/card"

// Every destination a notification type deep-links to - spelled out rather
// than a bare `{ to: string }` so this stays assignable to Link's
// strictly-typed `to` prop without a cast.
export type Target =
	| { to: "/questions/$questionId/{-$slug}"; params: { questionId: string } }
	| { to: "/groups/$groupId"; params: { groupId: string } }
	| { to: "/games/$gameId/{-$slug}"; params: { gameId: string; slug: string } }
	| {
			to: "/games/$gameId/picks/$username"
			params: { gameId: string; username: string }
	  }
	| {
			to: "/user/$username/streaks/$league/$family/$mode"
			params: {
				username: string
				league: string
				family: string
				mode: StreakMode
			}
	  }
	| {
			to: "/user/$username/sweeps/$league/$slateKey"
			params: { username: string; league: string; slateKey: string }
	  }
	// The first destination here that takes no params - the invite screen,
	// where an earned redo is spent or another link is sent.
	| { to: "/invite" }
	// A single call's own page - where a fade on it, and its Doubters, are.
	| { to: "/calls/$callId"; params: { callId: string } }
	| null

type Props = {
	id: string
	unread: boolean
	createdAt: string
	icon: IconType
	target: Target
	onOpen: (id: string) => void
	trailing?: ReactNode
	// Under the row, outside its link, for lines with destinations of their
	// own.
	footer?: ReactNode
	children: ReactNode
}

// The one piece every notification type shares regardless of what happened -
// unread styling, the "seen it, it's read" behavior, and the timestamp.
// Everything about *what happened* is the calling type's own component; this
// never branches on notification type itself.
export function NotificationShell({
	id,
	unread,
	createdAt,
	icon: Icon,
	target,
	onOpen,
	trailing,
	footer,
	children,
}: Props) {
	const ref = useRef<HTMLDivElement>(null)

	// Being on screen is what "read" means here - no separate mark-all-read
	// affordance. The dwell timer just guards against a row that flickers past
	// during a fast scroll counting as seen.
	useEffect(() => {
		if (!unread) return
		const node = ref.current
		if (!node) return
		let dwellTimer: ReturnType<typeof setTimeout> | null = null
		const observer = new IntersectionObserver(
			([entry]) => {
				if (entry.isIntersecting) {
					dwellTimer = setTimeout(() => onOpen(id), 500)
				} else if (dwellTimer) {
					clearTimeout(dwellTimer)
					dwellTimer = null
				}
			},
			{ threshold: 0.5 },
		)
		observer.observe(node)
		return () => {
			if (dwellTimer) clearTimeout(dwellTimer)
			observer.disconnect()
		}
	}, [unread, id, onOpen])

	const body = (
		<Card.Body>
			<HStack gap="3" alignItems="center">
				{unread && (
					<div
						className={css({
							width: "7px",
							height: "7px",
							borderRadius: "full",
							bg: "primary.default",
							flexShrink: 0,
						})}
					/>
				)}
				<Icon size={18} />
				<div className={css({ flex: 1, minWidth: 0 })}>
					{children}
					<p
						className={css({
							fontFamily: "mono",
							fontSize: "xs",
							color: "fg.muted",
							marginTop: "1",
						})}
					>
						{new Date(createdAt).toLocaleString()}
					</p>
				</div>
				{trailing}
			</HStack>
		</Card.Body>
	)

	return (
		<div ref={ref}>
			<Card
				variant={unread ? "surface" : "outline"}
				size="sm"
				interactive={target !== null}
			>
				{target ? (
					<Link
						to={target.to}
						// Spread rather than passed directly: a paramless destination has
						// no `params` key at all, and handing Link an explicit undefined
						// is not the same as omitting it.
						{...("params" in target ? { params: target.params } : {})}
						className={css({
							display: "block",
							textDecoration: "none",
							color: "inherit",
						})}
					>
						{body}
					</Link>
				) : (
					body
				)}
				{footer && <Card.Footer>{footer}</Card.Footer>}
			</Card>
		</div>
	)
}
