import { Link } from "@tanstack/react-router"
import { css, cx } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { Eyebrow } from "#/components/ui/eyebrow"
import { signTone } from "#/components/ui/sign-tone"
import { type FragmentType, graphql, useFragment } from "#/graphql/generated"
import { formatSigned } from "#/lib/format-number"
import { formatRecord, matchupLabel } from "#/lib/game-status"
import { buildGameSlug } from "#/lib/slug"

const GameHighlightFragment = graphql(`
	fragment ReportCardGameHighlight_game on ReportCardGame {
		netPoints
		wins
		losses
		game {
			id
			startsAt
			league {
				id
				slug
			}
			homeTeam {
				id
				name
				abbreviation
			}
			awayTeam {
				id
				name
				abbreviation
			}
		}
	}
`)

// Opens the owner's picks on that game, which count the same calls this
// record and points do. Falls back to the game itself with no owner to name.
export function ReportCardGameHighlight({
	label,
	row,
	username,
}: {
	label: string
	row: FragmentType<typeof GameHighlightFragment> | null | undefined
	username: string | null
}) {
	const data = useFragment(GameHighlightFragment, row ?? null)
	if (!data) return null
	const { game } = data
	return (
		<HStack
			justify="space-between"
			alignItems="baseline"
			gap="3"
			className={css({ paddingY: "1" })}
		>
			<VStack
				gap="0"
				alignItems="flex-start"
				className={css({ minWidth: "0" })}
			>
				<Eyebrow size="sm" variant="neutral">
					{label}
				</Eyebrow>
				<Link
					{...(username
						? {
								to: "/games/$gameId/picks/$username",
								params: { gameId: game.id, username },
							}
						: {
								to: "/games/$gameId/{-$slug}",
								params: { gameId: game.id, slug: buildGameSlug(game) },
							})}
					className={css({
						fontSize: "sm",
						color: "fg.default",
						textDecoration: "none",
						truncate: true,
						_hover: { textDecoration: "underline" },
					})}
				>
					{`${matchupLabel(game)} · ${formatRecord(data.wins, data.losses)}`}
				</Link>
			</VStack>
			<span
				className={cx(
					css({
						fontFamily: "mono",
						fontSize: "sm",
						fontWeight: "bold",
						whiteSpace: "nowrap",
					}),
					signTone(data.netPoints),
				)}
			>
				{formatSigned(data.netPoints, { zeroSign: true })}
			</span>
		</HStack>
	)
}
