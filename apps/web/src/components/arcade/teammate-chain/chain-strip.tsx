import { chainDurationLabel } from "@called-my-shot/schemas"
import { FiClock, FiHelpCircle, FiXCircle } from "react-icons/fi"
import { css } from "styled-system/css"
import { PlayerHeadshot } from "#/components/ui/player-headshot"
import type { TeammateChainPlayer_PlayerFragment } from "#/graphql/generated/graphql"
import { ChainStatChip } from "./chain-stat-chip"
import { ChainStripStep } from "./chain-strip-step"

// A finished game's chain as a picture: the start, a dot per player in
// between, the target, with "par" under the node where the shortest route
// ends. Past par, the extra links fade; given up, the two ends never join.
// Under it, chips for the time and for any hints and misses.
export function ChainStrip({
	start,
	target,
	links,
	par,
	seconds,
	hints,
	misses,
}: {
	start: TeammateChainPlayer_PlayerFragment
	target: TeammateChainPlayer_PlayerFragment
	// Null for a game given up.
	links: number | null
	par: number
	seconds: number | null
	hints: number
	misses: number
}) {
	const overPar = links !== null && links > par
	const end = (
		<PlayerHeadshot
			name={target.player.name}
			src={target.player.headshotUrl}
			size="md"
		/>
	)
	const dot = (
		<span
			className={css({
				width: "3",
				height: "3",
				borderRadius: "full",
				bg: "chain.ink",
			})}
		/>
	)

	return (
		<div
			className={css({
				display: "flex",
				flexDirection: "column",
				gap: "3",
			})}
		>
			<div
				className={css({
					display: "flex",
					flexDirection: "column",
					gap: "2",
					width: "full",
					maxWidth: "md",
				})}
			>
				<ol
					aria-label={
						links === null
							? "Not connected"
							: `${links} links${overPar ? `, par ${par}` : ", the shortest possible"}`
					}
					className={css({
						display: "flex",
						alignItems: "center",
						paddingBottom: links === null ? "0" : "5",
					})}
				>
					<li className={css({ display: "flex", flexShrink: 0 })}>
						<PlayerHeadshot
							name={start.player.name}
							src={start.player.headshotUrl}
							size="md"
						/>
					</li>
					{links === null ? (
						<ChainStripStep faded>{end}</ChainStripStep>
					) : (
						Array.from({ length: links }, (_, i) => {
							const step = i + 1
							return (
								<ChainStripStep
									key={step}
									faded={step > par}
									caption={step === par ? `par ${par}` : null}
								>
									{step === links ? end : dot}
								</ChainStripStep>
							)
						})
					)}
				</ol>
			</div>
			<div className={css({ display: "flex", gap: "2", flexWrap: "wrap" })}>
				{seconds !== null && (
					<ChainStatChip
						icon={<FiClock aria-hidden size={14} />}
						value={chainDurationLabel(seconds)}
						label={`Time ${chainDurationLabel(seconds)}`}
					/>
				)}
				{hints > 0 && (
					<ChainStatChip
						icon={
							<FiHelpCircle
								aria-hidden
								size={14}
								className={css({ color: "warning.default" })}
							/>
						}
						value={String(hints)}
						label={`${hints} ${hints === 1 ? "hint" : "hints"}`}
					/>
				)}
				{misses > 0 && (
					<ChainStatChip
						icon={
							<FiXCircle
								aria-hidden
								size={14}
								className={css({ color: "danger.default" })}
							/>
						}
						value={String(misses)}
						label={`${misses} ${misses === 1 ? "miss" : "misses"}`}
					/>
				)}
			</div>
		</div>
	)
}
