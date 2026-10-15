import { css } from "styled-system/css"
import { HStack } from "styled-system/jsx"
import { PlayerHeadshot } from "#/components/ui/player-headshot"
import { Tag } from "#/components/ui/tag"
import { detailClass, nameClass } from "./styles"
import type { Starter } from "./types"

export function StarterRow({ starter }: { starter: Starter }) {
	const slot =
		starter.role === "BATTER"
			? `${starter.sortOrder} ${starter.position ?? ""}`
			: (starter.position ?? "")

	return (
		<HStack gap="2" alignItems="center" minWidth="0">
			<span
				className={css({
					textStyle: "meta",
					color: "fg.muted",
					minWidth: "10",
					flexShrink: "0",
				})}
			>
				{slot}
			</span>
			<PlayerHeadshot
				name={starter.playerName}
				src={starter.player?.headshotUrl}
			/>
			<span className={nameClass}>{starter.playerName}</span>
			{starter.statLine && (
				<span className={detailClass}>{starter.statLine}</span>
			)}
			{starter.injuryStatus && <Tag size="sm">{starter.injuryStatus}</Tag>}
		</HStack>
	)
}
