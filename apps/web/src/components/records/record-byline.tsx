import { Link } from "@tanstack/react-router"
import type { ReactNode } from "react"
import { css } from "styled-system/css"
import { HStack } from "styled-system/jsx"
import { Avatar } from "#/components/ui/avatar"

type Props = {
	name: string
	username: string
	avatarUrl: string | null
	// When the record was set, already formatted. Omitted on a record whose
	// date the card states elsewhere.
	date?: ReactNode
}

// Whose record it is and when, across the top of a record card: the avatar
// and @handle link to their profile.
export function RecordByline({ name, username, avatarUrl, date }: Props) {
	const person = (
		<Link
			to="/user/$username"
			params={{ username }}
			className={css({
				display: "inline-flex",
				alignItems: "center",
				gap: "2",
				minWidth: "0",
				textDecoration: "none",
				color: "fg.default",
				_hover: { "& span": { textDecoration: "underline" } },
			})}
		>
			<Avatar size="xs" name={name} src={avatarUrl} />
			<span
				className={css({
					textStyle: "metaLg",
					truncate: true,
				})}
			>
				@{username}
			</span>
		</Link>
	)

	if (date === undefined) return person

	return (
		<HStack gap="2" alignItems="center" minWidth="0">
			{person}
			<span
				className={css({
					flexShrink: "0",
					textStyle: "metaLg",
					color: "fg.muted",
					whiteSpace: "nowrap",
				})}
			>
				· {date}
			</span>
		</HStack>
	)
}
