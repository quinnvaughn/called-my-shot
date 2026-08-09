import { css, cx } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import { Eyebrow } from "../ui/eyebrow"

type Props = {
	eyebrow: string
	title: string
	description: string
	center?: boolean
}

const centerText = css({ textAlign: "center" })

export function LandingPageSectionHeader({
	eyebrow,
	title,
	description,
	center,
}: Props) {
	return (
		<VStack alignItems={center ? "center" : "flex-start"} gap="3.5">
			<Eyebrow variant="primary">{eyebrow}</Eyebrow>
			<h2
				className={cx(
					css({
						fontFamily: "heading",
						fontSize: "3xl",
						lineHeight: "tight",
						letterSpacing: "tight",
						maxWidth: "xl",
					}),
					center && centerText,
				)}
			>
				{title}
			</h2>
			<p
				className={cx(
					css({
						color: "fg.muted",
						lineHeight: "relaxed",
						maxWidth: "xl",
					}),
					center && centerText,
				)}
			>
				{description}
			</p>
		</VStack>
	)
}
