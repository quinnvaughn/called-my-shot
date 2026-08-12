import { Link } from "@tanstack/react-router"
import type { ReactNode } from "react"
import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import { button } from "styled-system/recipes"
import { Eyebrow } from "../ui/eyebrow"

type Props = {
	icon: ReactNode
	eyebrowText: string
	heading: string
	subtitle: string
	link: {
		text: string
		url: string
	}
}

export function IncorrectGroup({
	icon,
	eyebrowText,
	heading,
	subtitle,
	link,
}: Props) {
	return (
		<VStack gap="8" alignItems="center" className={css({ padding: "8" })}>
			<VStack gap="4" alignItems="center">
				<div
					className={css({
						width: "56px",
						height: "56px",
						borderRadius: "full",
						border: "1px solid {colors.border.default}",
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						color: "fg.subtle",
						background: "card",
					})}
				>
					{icon}
				</div>
				<VStack gap="3" alignItems={"center"}>
					<Eyebrow variant="neutral">{eyebrowText}</Eyebrow>
					<h1 className={css({ fontFamily: "heading", fontSize: "2xl" })}>
						{heading}
					</h1>
				</VStack>
				<p
					className={css({
						fontFamily: "mono",
						fontSize: "xs",
						color: "fg.subtle",
					})}
				>
					{subtitle}
				</p>
			</VStack>
			<Link to={link.url} className={button({ variant: "solid", size: "md" })}>
				{link.text}
			</Link>
		</VStack>
	)
}
