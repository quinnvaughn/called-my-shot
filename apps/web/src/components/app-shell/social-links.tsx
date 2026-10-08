import { css } from "styled-system/css"
import { HStack } from "styled-system/jsx"
import { SOCIALS } from "#/lib/socials"

// Pinned to the bottom of the sidebar, so it stays on screen on every page
// without being part of the nav list.
export function SocialLinks() {
	return (
		<HStack
			gap="1"
			paddingTop="4"
			paddingInline="1"
			className={css({ borderTop: "1px solid {colors.border.default}" })}
		>
			{SOCIALS.map((social) => (
				<a
					key={social.label}
					href={social.url}
					target="_blank"
					rel="noopener noreferrer"
					aria-label={social.label}
					title={social.label}
					className={css({
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						width: "8",
						height: "8",
						borderRadius: "lg",
						color: "fg.subtle",
						_hover: { bg: "fg.default/10", color: "fg.default" },
					})}
				>
					<social.icon size={18} aria-hidden />
				</a>
			))}
		</HStack>
	)
}
