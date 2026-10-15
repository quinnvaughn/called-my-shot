import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { BoxLabel } from "#/components/questions/box-label"

export function PointsPreviewShell({
	tierText,
	tierVal,
	winText,
	winNote,
	loseText,
	loseNote,
}: {
	tierText: string
	tierVal?: string
	winText: string | null
	winNote?: string
	loseText: string | null
	loseNote?: string
}) {
	return (
		<VStack gap="2" alignItems="stretch">
			<HStack justify="space-between" gap="2">
				<span
					className={css({
						textStyle: "meta",
						color: "fg.subtle",
					})}
				>
					{tierText}
				</span>
				{tierVal && (
					<span
						className={css({
							textStyle: "meta",
							color: "fg.muted",
							flexShrink: "0",
						})}
					>
						{tierVal}
					</span>
				)}
			</HStack>
			{winText !== null && loseText !== null && (
				<HStack gap="2">
					<VStack
						gap="0.5"
						alignItems="flex-start"
						className={css({
							flex: "1",
							background: "bg.canvas",
							borderRadius: "sm",
							padding: "2",
						})}
					>
						<BoxLabel label="IF RIGHT" note={winNote} />
						<span
							className={css({
								fontFamily: "mono",
								fontSize: "sm",
								fontWeight: "bold",
								color: "success.default",
							})}
						>
							{winText}
						</span>
					</VStack>
					<VStack
						gap="0.5"
						alignItems="flex-start"
						className={css({
							flex: "1",
							background: "bg.canvas",
							borderRadius: "sm",
							padding: "2",
						})}
					>
						<BoxLabel label="IF WRONG" note={loseNote} />
						<span
							className={css({
								fontFamily: "mono",
								fontSize: "sm",
								fontWeight: "bold",
								color: "danger.default",
							})}
						>
							{loseText}
						</span>
					</VStack>
				</HStack>
			)}
		</VStack>
	)
}
