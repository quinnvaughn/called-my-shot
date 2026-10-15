import { FiChevronLeft, FiChevronRight } from "react-icons/fi"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { GameDayPicker } from "#/components/leagues/game-day-picker"
import { Select } from "#/components/ui/select"
import type {
	LeagueGameWindowsQuery,
	LeagueWindowType,
} from "#/graphql/generated/graphql"

type Props = {
	windowType: LeagueWindowType | undefined
	currentWindow: { key: string; label: string; sublabel: string | null }
	windows: LeagueGameWindowsQuery["leagueGameWindows"]
	prevKey: string | null
	nextKey: string | null
	onStep: (key: string | null) => void
}

export function GameWindowStepper({
	windowType,
	currentWindow,
	windows,
	prevKey,
	nextKey,
	onStep,
}: Props) {
	return (
		<HStack gap="2" alignItems="flex-start">
			<button
				type="button"
				aria-label="Previous"
				disabled={!prevKey}
				onClick={() => onStep(prevKey)}
				className={css({
					display: "flex",
					alignItems: "center",
					justifyContent: "center",
					width: "10",
					height: "10",
					flexShrink: 0,
					borderRadius: "lg",
					border: "1px solid {colors.border.default}",
					color: "fg.subtle",
					cursor: "pointer",
					_disabled: { opacity: 0.3, cursor: "default" },
					_hover: {
						color: "fg.default",
						border: "1px solid {colors.border.emphasized}",
					},
				})}
			>
				<FiChevronLeft />
			</button>

			<VStack gap="1.5" flex="1" minWidth="0" alignItems="stretch">
				{windowType === "WEEK" ? (
					<Select value={currentWindow.key} onValueChange={onStep}>
						<Select.Trigger
							className={css({ "& > span": { textAlign: "center" } })}
						>
							{currentWindow.label}
						</Select.Trigger>
						<Select.Content>
							{windows.map((w) => (
								<Select.Option key={w.key} value={w.key}>
									{w.label}
								</Select.Option>
							))}
						</Select.Content>
					</Select>
				) : (
					<GameDayPicker
						windows={windows}
						selectedKey={currentWindow.key}
						label={currentWindow.label}
						onSelect={onStep}
					/>
				)}
				{currentWindow.sublabel && (
					<span
						className={css({
							textStyle: "meta",
							color: "fg.subtle",
							textAlign: "center",
						})}
					>
						{currentWindow.sublabel}
					</span>
				)}
			</VStack>

			<button
				type="button"
				aria-label="Next"
				disabled={!nextKey}
				onClick={() => onStep(nextKey)}
				className={css({
					display: "flex",
					alignItems: "center",
					justifyContent: "center",
					width: "10",
					height: "10",
					flexShrink: 0,
					borderRadius: "lg",
					border: "1px solid {colors.border.default}",
					color: "fg.subtle",
					cursor: "pointer",
					_disabled: { opacity: 0.3, cursor: "default" },
					_hover: {
						color: "fg.default",
						border: "1px solid {colors.border.emphasized}",
					},
				})}
			>
				<FiChevronRight />
			</button>
		</HStack>
	)
}
