import { useState } from "react"
import { createPortal } from "react-dom"
import { FiCalendar, FiChevronLeft, FiChevronRight } from "react-icons/fi"
import { css, cx } from "styled-system/css"
import { dateTimePicker as dateTimePickerRecipe } from "styled-system/recipes"
import { Button } from "./button"
import { useAnchoredPopover } from "./use-anchored-popover"

type Props = {
	value: number | null
	onValueChange: (year: number | null) => void
	// What the trigger says with nothing picked.
	placeholder: string
	min: number
	max: number
	"aria-label": string
	className?: string
}

// Picks one year from a decade at a time, the way DateTimePicker picks a day
// from a month, and shares its look. Clear leaves it empty, for a field where
// no year is a real answer.
export function YearPicker({
	value,
	onValueChange,
	placeholder,
	min,
	max,
	"aria-label": label,
	className,
}: Props) {
	const popover = useAnchoredPopover()
	const { open } = popover
	const slots = dateTimePickerRecipe({ open })
	const [decade, setDecade] = useState(() => decadeOf(value ?? max))
	const years = Array.from({ length: 10 }, (_, i) => decade + i).filter(
		(year) => year >= min && year <= max,
	)

	function openPicker() {
		setDecade(decadeOf(value ?? max))
		popover.openPopover()
	}

	function pick(year: number | null) {
		onValueChange(year)
		popover.close()
	}

	return (
		<div ref={popover.rootRef} className={cx(slots.root, className)}>
			<button
				ref={popover.triggerRef}
				type="button"
				aria-label={label}
				aria-haspopup="dialog"
				aria-expanded={open}
				className={slots.trigger}
				onClick={() => (open ? popover.close() : openPicker())}
			>
				<span className={slots.triggerLabel}>{value ?? placeholder}</span>
				<FiCalendar size={14} className={slots.triggerIcon} />
			</button>
			{open &&
				createPortal(
					<>
						{popover.isMobile && <div aria-hidden className={slots.scrim} />}
						<div
							ref={popover.contentRef}
							role="dialog"
							aria-label={label}
							className={slots.content}
							style={popover.contentStyle}
						>
							<div className={slots.dragHandle} />
							<div className={slots.calendarHeader}>
								<button
									type="button"
									aria-label="Earlier decade"
									className={slots.navButton}
									disabled={decade <= decadeOf(min)}
									onClick={() => setDecade((d) => d - 10)}
								>
									<FiChevronLeft size={14} />
								</button>
								<span className={slots.monthLabel}>{decade}s</span>
								<button
									type="button"
									aria-label="Later decade"
									className={slots.navButton}
									disabled={decade >= decadeOf(max)}
									onClick={() => setDecade((d) => d + 10)}
								>
									<FiChevronRight size={14} />
								</button>
							</div>
							<div className={yearGrid}>
								{years.map((year) => {
									const selected = year === value
									return (
										<button
											key={year}
											type="button"
											aria-pressed={selected}
											className={cx(yearCell, selected && yearCellSelected)}
											onClick={() => pick(year)}
										>
											{year}
										</button>
									)
								})}
							</div>
							<div className={slots.footer}>
								<Button variant="ghost" size="sm" onClick={() => pick(null)}>
									Clear
								</Button>
								<Button variant="solid" size="sm" onClick={popover.close}>
									Done
								</Button>
							</div>
						</div>
					</>,
					document.body,
				)}
		</div>
	)
}

const decadeOf = (year: number) => Math.floor(year / 10) * 10

const yearGrid = css({
	display: "grid",
	gridTemplateColumns: "repeat(5, 1fr)",
	gap: "1",
})

const yearCell = css({
	paddingBlock: "2.5",
	borderRadius: "md",
	fontSize: "sm",
	color: "fg.default",
	cursor: "pointer",
	transition: "background-color 0.15s ease",
	_hover: { backgroundColor: "bg.subtle" },
})

const yearCellSelected = css({
	backgroundColor: "primary.default",
	color: "primary.contrast",
	fontWeight: "bold",
	_hover: { backgroundColor: "primary.default" },
})
