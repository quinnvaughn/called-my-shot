import { describeLink } from "@called-my-shot/schemas"
import { css } from "styled-system/css"
import { HStack } from "styled-system/jsx"
import { linkIcons } from "#/lib/link-icons"

type Props = {
	links: { id: string; url: string; label?: string | null }[]
}

// The group's socials and websites, under its name on the group page. Not
// on the invite page: someone deciding whether to join shouldn't be handed
// a way out first.
export function GroupLinks({ links }: Props) {
	if (links.length === 0) return null

	return (
		<HStack gap="2" flexWrap="wrap">
			{links.map((link) => {
				const { platform, label } = describeLink(link.url, link.label)
				const Icon = linkIcons[platform]
				return (
					<a
						key={link.id}
						href={link.url}
						target="_blank"
						// Admin-entered, so it gets no referrer, no window.opener, and
						// none of this site's search ranking.
						rel="noopener noreferrer nofollow ugc"
						className={css({
							display: "inline-flex",
							alignItems: "center",
							gap: "1.5",
							maxWidth: "full",
							paddingInline: "2.5",
							paddingBlock: "1",
							border: "1px solid {colors.border.default}",
							borderRadius: "full",
							fontSize: "xs",
							color: "fg.muted",
							transition: "color 0.15s ease, border-color 0.15s ease",
							_hover: {
								color: "fg.default",
								borderColor: "border.emphasized",
							},
						})}
					>
						<Icon size={13} aria-hidden className={css({ flexShrink: 0 })} />
						<span
							className={css({
								overflow: "hidden",
								textOverflow: "ellipsis",
								whiteSpace: "nowrap",
							})}
						>
							{label}
						</span>
					</a>
				)
			})}
		</HStack>
	)
}
