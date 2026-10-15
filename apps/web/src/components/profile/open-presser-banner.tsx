import { Link } from "@tanstack/react-router"
import { FiMic } from "react-icons/fi"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { presserEyebrow } from "#/components/pressers/presser-qa-item"
import { closesInLabel } from "#/components/pressers/presser-result"
import { Card } from "#/components/ui/card"
import { useFragment } from "#/graphql/generated"
import { matchupLabel } from "#/lib/game-status"
import {
	ProfilePresserFragment,
	type ProfilePresserRef,
} from "./pressers-section"

// Under the profile header while they have a presser taking questions: where
// to go to ask one, or, on their own profile, to answer. The newest game's
// presser, with how many more are open.
export function OpenPresserBanner({
	username,
	isOwn,
	pressers: pressersProp,
}: {
	username: string
	isOwn: boolean
	pressers: ProfilePresserRef[]
}) {
	const pressers = useFragment(ProfilePresserFragment, pressersProp)
	const [newest] = pressers
	if (!newest) return null
	const more = pressers.length - 1

	return (
		<Link
			to="/games/$gameId/picks/$username"
			params={{ gameId: newest.game.id, username }}
			hash="presser"
			className={css({
				display: "block",
				textDecoration: "none",
				color: "inherit",
			})}
		>
			<Card size="sm" interactive>
				<Card.Body>
					<HStack justify="space-between" gap="3" flexWrap="wrap">
						<HStack gap="2.5" minWidth="0">
							<FiMic
								size={16}
								aria-hidden
								className={css({ color: "secondary.default", flexShrink: 0 })}
							/>
							<VStack gap="0.5" alignItems="flex-start" minWidth="0">
								<span
									className={css({ fontSize: "sm", fontWeight: "semibold" })}
								>
									{isOwn ? "Your presser is open" : "Taking questions"} on{" "}
									{matchupLabel(newest.game)}
									{more > 0 ? ` and ${more} more` : ""}
								</span>
								<span className={presserEyebrow}>
									{closesInLabel(newest.closesAt)}
								</span>
							</VStack>
						</HStack>
						<span
							className={css({
								textStyle: "label",
								color: "primary.default",
								whiteSpace: "nowrap",
							})}
						>
							{isOwn ? "Answer questions →" : "Ask a question →"}
						</span>
					</HStack>
				</Card.Body>
			</Card>
		</Link>
	)
}
