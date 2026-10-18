import type { ReactNode } from "react"
import { FiChevronLeft } from "react-icons/fi"
import { css } from "styled-system/css"
import { openModal } from "#/stores/modal-store"
import { RailSheet } from "./rail-sheet"

// A slim tab on the right edge that opens the page's right rail as a sheet,
// below xl where the shell hides the rail. Pass content that reads its data
// from the query cache rather than props, so it keeps updating while the
// sheet is open.
export function RailTab({
	title,
	children,
}: {
	title: string
	children: ReactNode
}) {
	return (
		<button
			type="button"
			onClick={() => openModal(<RailSheet title={title}>{children}</RailSheet>)}
			className={css({
				display: { base: "flex", xl: "none" },
				flexDirection: "column",
				alignItems: "center",
				gap: "1.5",
				position: "fixed",
				zIndex: "launcher",
				right: "0",
				top: "50%",
				transform: "translateY(-50%)",
				width: "5",
				paddingBlock: "2.5",
				backgroundColor: "bg.surface",
				borderTop: "1px solid {colors.border.emphasized}",
				borderBottom: "1px solid {colors.border.emphasized}",
				borderLeft: "1px solid {colors.border.emphasized}",
				borderTopLeftRadius: "md",
				borderBottomLeftRadius: "md",
				color: "fg.muted",
				cursor: "pointer",
			})}
		>
			<span
				className={css({
					textStyle: "label",
					writingMode: "vertical-rl",
					whiteSpace: "nowrap",
				})}
			>
				Your calls
			</span>
			<FiChevronLeft size={14} />
		</button>
	)
}
