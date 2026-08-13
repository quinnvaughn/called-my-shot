import { css, cx } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { Card } from "#/components/ui/card"
import { Tag } from "#/components/ui/tag"
import { hexToRgba } from "#/lib/color"

type Team = {
	name: string
	percent: number
	tier?: string
	selected?: boolean
	// Real team color, not a brand token - same idea as TeamBadge/CallCard's
	// subjectTeam.color, just hardcoded here since this card is static marketing
	// copy, not backed by a real question.
	color: string
}

const teams: Team[] = [
	{
		name: "Detroit Lions",
		percent: 6,
		tier: "UNDERDOG",
		selected: true,
		color: "#0076B6",
	},
	{ name: "Kansas City Chiefs", percent: 19, color: "#E31837" },
]

function MockTeamRow({ name, percent, tier, selected, color }: Team) {
	return (
		<div
			className={css({
				position: "relative",
				overflow: "hidden",
				// White track, not the muddy bg.subtle tan from before - the fill
				// below is what needs to read clearly, and it can't against
				// another warm neutral.
				bg: "bg.surface",
				border: "1px solid",
				borderColor: selected ? "primary.default" : "border.default",
				borderRadius: "lg",
				padding: "{spacing.2.5} {spacing.3.5}",
			})}
		>
			<div
				className={css({
					position: "absolute",
					inset: "0",
				})}
				style={{ width: `${percent}%`, backgroundColor: hexToRgba(color, 0.1) }}
			/>
			<div
				className={css({
					position: "relative",
					display: "flex",
					justifyContent: "space-between",
					alignItems: "center",
					fontSize: "sm",
				})}
			>
				<span>{name}</span>
				<span
					className={cx(
						css({ fontFamily: "mono", fontSize: "xs" }),
						css({ color: tier ? "primary.default" : "fg.subtle" }),
					)}
				>
					{tier ? `${tier} · ${percent}%` : `${percent}%`}
				</span>
			</div>
		</div>
	)
}

export function LandingPageMockCard() {
	return (
		<Card variant="surface" size="lg" aria-hidden>
			<Card.Body>
				<VStack gap="3.5" alignItems="flex-start">
					<VStack gap="3.5" alignItems="flex-start" width="full">
						<HStack gap="2">
							<Tag variant="primary">OFFICIAL</Tag>
							<Tag>SEASON AWARDS</Tag>
						</HStack>
						<VStack gap="4.5" alignItems="flex-start" width="full">
							<div
								className={css({
									fontFamily: "heading",
									fontSize: "lg",
									lineHeight: "snug",
								})}
							>
								Who wins Super Bowl LXI?
							</div>
							<VStack gap="2" alignItems="stretch" width="full">
								{teams.map((team) => (
									<MockTeamRow key={team.name} {...team} />
								))}
							</VStack>
						</VStack>
					</VStack>
					<HStack
						justifyContent="space-between"
						alignItems="center"
						bg="bg.canvas"
						borderRadius="lg"
						width="full"
						padding="{spacing.2.5} {spacing.3.5}"
					>
						<span
							className={css({
								fontFamily: "mono",
								fontSize: "xs",
								color: "fg.muted",
							})}
						>
							POINTS IF RIGHT
						</span>
						<span
							className={css({
								fontFamily: "heading",
								fontSize: "md",
								color: "secondary.default",
							})}
						>
							+500
						</span>
					</HStack>
				</VStack>
			</Card.Body>
		</Card>
	)
}
