import { useState } from "react"
import { css } from "styled-system/css"
import { Flex, VStack } from "styled-system/jsx"
import type { Breakdown } from "./types"

// The toggle and its ledger, split out from PickRowShell so it can stand on
// its own with no pick-name header riding along with it.
export function WhyThesePoints({ breakdown }: { breakdown: Breakdown }) {
	const [expanded, setExpanded] = useState(false)
	return (
		<>
			<button
				type="button"
				onClick={() => setExpanded((v) => !v)}
				className={css({
					alignSelf: "flex-start",
					fontFamily: "mono",
					fontSize: "2xs",
					letterSpacing: "wide",
					color: "fg.muted",
					cursor: "pointer",
					_hover: { color: "fg.default" },
				})}
			>
				{expanded ? "▾" : "▸"} why these points
			</button>
			{expanded && (
				<VStack
					gap="1.5"
					alignItems="stretch"
					className={css({
						borderTop: "1px solid {colors.border.default}",
						paddingTop: "1.5",
					})}
				>
					{breakdown.ledger.map((row) => (
						// Label-left/math-right in one row runs out of width fast once
						// the math side is a full equation ("200 × 70% conviction =
						// 140") - both sides were nowrap, so on a narrow phone that's
						// two unbreakable strings fighting for ~300px. Stacked below
						// the label instead of squeezed beside it, the equation gets
						// the full row width to itself.
						<Flex
							key={row.label}
							direction={{ base: "column", sm: "row" }}
							justify={{ sm: "space-between" }}
							gap={{ base: "0.5", sm: "3" }}
						>
							<span
								className={css({
									textStyle: "metaLg",
									color: "fg.muted",
									whiteSpace: "nowrap",
								})}
							>
								{row.label}
							</span>
							<span
								className={css({
									whiteSpace: { base: "normal", sm: "nowrap" },
								})}
							>
								{row.math}
							</span>
						</Flex>
					))}
					{breakdown.note && (
						<span
							className={css({
								fontSize: "xs",
								color: "fg.body",
								lineHeight: "relaxed",
							})}
						>
							{breakdown.note}
						</span>
					)}
				</VStack>
			)}
		</>
	)
}
