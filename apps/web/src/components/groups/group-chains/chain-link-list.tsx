import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { SectionLabel } from "#/components/ui/section-label"
import type { ChainLinkData } from "#/lib/chains"
import { ChainLinkRow } from "./chain-link-row"
import { ChainLinkStatus } from "./chain-link-status"

// The links in game order, joined down the left by the chain itself, each
// joint lit by how its link landed. A lone link has nothing to join, so it's
// just its row.
export function ChainLinkList({ links }: { links: ChainLinkData[] }) {
	const [only] = links
	if (links.length === 1 && only) {
		return (
			<VStack gap="3" alignItems="stretch">
				<SectionLabel>The chain</SectionLabel>
				<ChainLinkRow link={only} trailing={<ChainLinkStatus link={only} />} />
			</VStack>
		)
	}
	return (
		<VStack gap="3" alignItems="stretch">
			<SectionLabel>The chain</SectionLabel>
			<VStack gap="0" alignItems="stretch">
				{links.map((link, i) => (
					<HStack key={link.id} gap="3" alignItems="stretch">
						<VStack gap="0" alignItems="center" width="4" flexShrink="0">
							<div
								className={css({
									flex: "1",
									width: "2px",
									bg: i === 0 ? "transparent" : "border.emphasized",
								})}
							/>
							<div
								className={css({
									width: "3",
									height: "3",
									borderRadius: "full",
									flexShrink: "0",
									bg:
										link.outcome === "HIT"
											? "success.default"
											: link.outcome === "MISS"
												? "danger.default"
												: "border.emphasized",
								})}
							/>
							<div
								className={css({
									flex: "1",
									width: "2px",
									bg:
										i === links.length - 1
											? "transparent"
											: "border.emphasized",
								})}
							/>
						</VStack>
						<div
							className={css({ flex: "1", minWidth: "0", paddingBlock: "1.5" })}
						>
							<ChainLinkRow
								link={link}
								trailing={<ChainLinkStatus link={link} />}
							/>
						</div>
					</HStack>
				))}
			</VStack>
		</VStack>
	)
}
