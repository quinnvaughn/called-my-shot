import type { IconType } from "react-icons"
import { FiChevronDown } from "react-icons/fi"
import { css, cx } from "styled-system/css"
import { match } from "ts-pattern"
import { stripCountClass } from "./styles"

const stripNameClass = css({
	display: "flex",
	alignItems: "center",
	gap: "1.5",
	minWidth: "0",
	color: "fg.muted",
})

const stripNameTextClass = css({
	textStyle: "label",
	truncate: true,
})

type Props = {
	name: string
	icon: IconType
	navigationLabel: string
	setSummary?: string
	// The resolved collapse state, and the reader's explicit choice behind it
	// (null while the viewport default holds).
	isCollapsed: boolean
	collapsedOverride: boolean | null
	isMember: boolean
	currentIndex: number
	memberCount: number
	onToggle: () => void
}

// The header is the only control up here, and the whole row is its target: a
// phone gets the strip closed by default, so the thing that opens it should
// be the easiest element on the card to hit. The member list has its own
// disclosure down inside the body - putting it up here too meant two chevrons
// side by side doing different things.
export function StripHeader({
	name,
	icon: Icon,
	navigationLabel,
	setSummary,
	isCollapsed,
	collapsedOverride,
	isMember,
	currentIndex,
	memberCount,
	onToggle,
}: Props) {
	// Written out per case rather than composed, so every rule Panda has to
	// extract is a literal it can see at build time.
	const chevronClass = match({ collapsedOverride, isMember })
		.with({ collapsedOverride: null, isMember: true }, () =>
			css({ transform: { base: "rotate(0deg)", sm: "rotate(180deg)" } }),
		)
		.with({ collapsedOverride: null, isMember: false }, () =>
			css({ transform: "rotate(0deg)" }),
		)
		.with({ collapsedOverride: true }, () => css({ transform: "rotate(0deg)" }))
		.with({ collapsedOverride: false }, () =>
			css({ transform: "rotate(180deg)" }),
		)
		.exhaustive()

	return (
		<button
			type="button"
			onClick={onToggle}
			aria-expanded={!isCollapsed}
			aria-label={
				isCollapsed
					? `Show ${navigationLabel} navigation`
					: `Hide ${navigationLabel} navigation`
			}
			className={css({
				display: "flex",
				alignItems: "center",
				justifyContent: "space-between",
				gap: "2",
				width: "full",
				// Thumb-sized on a phone; natural height on a pointer device,
				// where an oversized header is just dead space.
				minHeight: { base: "44px", sm: "0" },
				cursor: "pointer",
				_hover: { "& [data-strip-name]": { color: "fg.default" } },
			})}
		>
			<span className={stripNameClass} data-strip-name>
				<Icon size={15} className={css({ flexShrink: "0" })} />
				<span className={stripNameTextClass}>{name}</span>
			</span>
			<span
				className={css({
					display: "flex",
					alignItems: "center",
					gap: "2",
					flexShrink: "0",
				})}
			>
				{isMember ? (
					<span className={stripCountClass}>
						{currentIndex + 1} of {memberCount}
					</span>
				) : (
					setSummary && <span className={stripCountClass}>{setSummary}</span>
				)}
				<FiChevronDown
					size={13}
					className={cx(
						css({
							color: "fg.subtle",
							transition: "transform 0.15s ease",
						}),
						chevronClass,
					)}
				/>
			</span>
		</button>
	)
}
