import { Link } from "@tanstack/react-router"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { Card } from "#/components/ui/card"
import type { PlayGame } from "#/lib/play-games"

export function PlayGameCard({ game }: { game: PlayGame }) {
	const Icon = game.icon
	return (
		<Link to="/play/$gameSlug" params={{ gameSlug: game.slug }}>
			<Card interactive>
				<Card.Body>
					<HStack gap="4" alignItems="center">
						<span
							className={css({
								display: "flex",
								alignItems: "center",
								justifyContent: "center",
								width: "10",
								height: "10",
								flexShrink: 0,
								borderRadius: "md",
								bg: "bg.subtle",
								border: "1px solid {colors.border.default}",
								color: "fg.default",
							})}
						>
							<Icon size={18} />
						</span>
						<VStack gap="1" alignItems="flex-start">
							<h2
								className={css({
									fontFamily: "heading",
									fontSize: "lg",
									lineHeight: "tight",
								})}
							>
								{game.name}
							</h2>
							<p className={css({ fontSize: "sm", color: "fg.body" })}>
								{game.description}
							</p>
						</VStack>
					</HStack>
				</Card.Body>
			</Card>
		</Link>
	)
}
