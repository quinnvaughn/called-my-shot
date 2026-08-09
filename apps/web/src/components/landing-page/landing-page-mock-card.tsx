import { css, cx } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { Card } from "#/components/ui/card"

type Team = {
	name: string
	percent: number
	tier?: string
	selected?: boolean
}

const teams: Team[] = [
	{ name: "Detroit Lions", percent: 6, tier: "UNDERDOG", selected: true },
	{ name: "Kansas City Chiefs", percent: 19 },
]

function MockTag({ alt, children }: { alt?: boolean; children: string }) {
	return (
		<span
			className={css({
				fontFamily: "mono",
				fontSize: "xs",
				letterSpacing: "wide",
				padding: "{spacing.1} {spacing.2}",
				borderRadius: "sm",
				bg: alt ? "bg.subtle" : "primary.subtle",
				color: alt ? "fg.subtle" : "primary.default",
			})}
		>
			{children}
		</span>
	)
}

function MockTeamRow({ name, percent, tier, selected }: Team) {
	return (
		<div
			className={css({
				position: "relative",
				overflow: "hidden",
				bg: "bg.subtle",
				border: "0.5px solid",
				borderColor: selected ? "primary.default" : "border.default",
				borderRadius: "lg",
				padding: "{spacing.2.5} {spacing.3.5}",
			})}
		>
			<div
				className={css({
					position: "absolute",
					inset: "0",
					bg: "primary.subtle",
				})}
				style={{ width: `${percent}%` }}
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
							<MockTag>OFFICIAL</MockTag>
							<MockTag alt>SEASON AWARDS</MockTag>
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
