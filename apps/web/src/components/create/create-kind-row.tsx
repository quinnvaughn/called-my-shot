import { Link } from "@tanstack/react-router"
import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import type { CreateKind } from "#/lib/create-kinds"

// One thing the Create sheet can make: what it is and what making one
// involves, opening its composer.
export function CreateKindRow({
	kind,
	onNavigate,
}: {
	kind: CreateKind
	onNavigate: () => void
}) {
	const Icon = kind.icon
	return (
		<Link
			to={kind.to}
			onClick={onNavigate}
			className={css({
				display: "flex",
				alignItems: "flex-start",
				gap: "3",
				padding: "3",
				borderRadius: "lg",
				textAlign: "left",
				_hover: { bg: "fg.default/10" },
			})}
		>
			<span
				className={css({
					display: "flex",
					alignItems: "center",
					justifyContent: "center",
					width: "9",
					height: "9",
					flexShrink: 0,
					borderRadius: "md",
					bg: "bg.subtle",
					border: "1px solid {colors.border.default}",
					color: "fg.default",
				})}
			>
				<Icon size={16} aria-hidden />
			</span>
			<VStack gap="0.5" alignItems="flex-start" minWidth="0">
				<span className={css({ fontSize: "sm", fontWeight: "semibold" })}>
					{kind.label}
				</span>
				<span className={css({ fontSize: "xs", color: "fg.muted" })}>
					{kind.description}
				</span>
			</VStack>
		</Link>
	)
}
