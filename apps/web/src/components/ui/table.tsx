import {
	createContext,
	type HTMLAttributes,
	type ReactNode,
	type TableHTMLAttributes,
	type TdHTMLAttributes,
	useContext,
} from "react"
import { FiChevronDown, FiChevronUp } from "react-icons/fi"
import { cx } from "styled-system/css"
import { table as tableRecipe } from "styled-system/recipes"

type SortDir = "asc" | "desc"

// Untyped at the context boundary (Key erased to string) so one context can
// back a `<Table>` for any column key union — each call site gets its own
// typed `sortBy`/`onSort` back through the generic root props.
type TableContextValue = {
	sortBy: string
	sortDir: SortDir
	onSort?: (key: string) => void
	wide?: boolean
}

const TableContext = createContext<TableContextValue | null>(null)

function useTableContext(part: string) {
	const ctx = useContext(TableContext)
	if (!ctx) {
		throw new Error(`Table.${part} must be rendered inside <Table>`)
	}
	return ctx
}

type TableProps<Key extends string> = TableHTMLAttributes<HTMLTableElement> & {
	sortBy: Key
	sortDir: SortDir
	onSort?: (key: Key) => void
	// See the `wide` variant in panda.config.ts - opt in when a column (eg. a
	// free-text title) can't be meaningfully truncated to a fixed width.
	wide?: boolean
}

function Root<Key extends string>({
	sortBy,
	sortDir,
	onSort,
	wide,
	className,
	children,
	...props
}: TableProps<Key>) {
	const slots = tableRecipe({ wide })
	return (
		<TableContext.Provider
			value={{
				sortBy,
				sortDir,
				onSort: onSort as TableContextValue["onSort"],
				wide,
			}}
		>
			{/* Explicit width here, not just on the table — inside a flex parent
			with alignItems: "flex-start" (VStack/HStack's default), a plain
			block div shrinks to fit its content instead of stretching, which
			silently defeats width: "full" on the table itself. */}
			<div className={slots.wrapper}>
				<table className={cx(slots.table, className)} {...props}>
					{children}
				</table>
			</div>
		</TableContext.Provider>
	)
}

export type TableColumn<Key extends string> = {
	key: Key
	label: string
	sortable?: boolean
	numeric?: boolean
	// Leave unset on the one column that should absorb whatever width the
	// other (explicitly-sized) columns don't use — the <table> analog of a
	// CSS grid "1fr" track.
	width?: string
}

function Head<Key extends string>({
	columns,
}: {
	columns: TableColumn<Key>[]
}) {
	const { sortBy, sortDir, onSort } = useTableContext("Head")

	return (
		<>
			<colgroup>
				{columns.map(({ key, width }) => (
					<col key={key} style={width ? { width } : undefined} />
				))}
			</colgroup>
			<thead>
				<tr>
					{columns.map(({ key, label, sortable = true, numeric = false }) => {
						const isActive = sortable && sortBy === key
						const canSort = sortable && !!onSort
						const Icon =
							isActive && sortDir === "asc" ? FiChevronUp : FiChevronDown
						const slots = tableRecipe({
							sortActive: isActive,
							sortable: canSort,
							numeric,
						})

						return (
							<th
								key={key}
								onClick={canSort ? () => onSort?.(key) : undefined}
								className={slots.headerCell}
							>
								<span className={slots.headerLabel}>
									{label}
									{sortable && <Icon />}
								</span>
							</th>
						)
					})}
				</tr>
			</thead>
		</>
	)
}

function Body({
	className,
	...props
}: HTMLAttributes<HTMLTableSectionElement>) {
	return <tbody className={className} {...props} />
}

type RowProps = HTMLAttributes<HTMLTableRowElement> & {
	// Highlights the row belonging to the viewer (eg. "you" on a leaderboard).
	active?: boolean
}

function Row({ active, className, ...props }: RowProps) {
	const slots = tableRecipe({ selected: active })
	return <tr className={cx(slots.row, className)} {...props} />
}

type CellProps = TdHTMLAttributes<HTMLTableCellElement> & {
	numeric?: boolean
}

function Cell({ numeric, className, ...props }: CellProps) {
	const { wide } = useTableContext("Cell")
	const slots = tableRecipe({ numeric, wide })
	return <td className={cx(slots.cell, className)} {...props} />
}

// --- Pagination ---

// Always shows first/last page plus a window around the current page,
// collapsing the rest into an ellipsis — avoids a wall of page numbers once
// there are more than a handful of pages.
type PageItem = number | "ellipsis"

function buildPageItems(current: number, total: number): PageItem[] {
	if (total <= 7) {
		return Array.from({ length: total }, (_, i) => i + 1)
	}

	const items: PageItem[] = [1]
	const start = Math.max(2, current - 1)
	const end = Math.min(total - 1, current + 1)

	if (start > 2) items.push("ellipsis")
	for (let page = start; page <= end; page++) items.push(page)
	if (end < total - 1) items.push("ellipsis")

	items.push(total)

	return items
}

function PageButton({
	page,
	active,
	disabled,
	renderLink,
	children,
}: {
	page: number
	active?: boolean
	disabled?: boolean
	renderLink: (
		page: number,
		children: ReactNode,
		className: string,
	) => ReactNode
	children: ReactNode
}) {
	if (active) {
		const slots = tableRecipe({ pageActive: true })
		return <span className={slots.pageButton}>{children}</span>
	}

	if (disabled) {
		const slots = tableRecipe({ pageDisabled: true })
		return <span className={slots.pageButton}>{children}</span>
	}

	const slots = tableRecipe({ pageLink: true })
	return <>{renderLink(page, children, slots.pageButton)}</>
}

function Pagination({
	page,
	totalPages,
	renderLink,
}: {
	page: number
	totalPages: number
	// The Table has no knowledge of routing, so the caller is responsible for
	// rendering the actual <Link> (with its route-specific `to`/params)
	// around the given children, using the given className for button styling.
	renderLink: (
		page: number,
		children: ReactNode,
		className: string,
	) => ReactNode
}) {
	const slots = tableRecipe()
	return (
		<div className={slots.paginationRow}>
			<PageButton page={page - 1} disabled={page <= 1} renderLink={renderLink}>
				← Prev
			</PageButton>
			{buildPageItems(page, totalPages).map((item, i) =>
				item === "ellipsis" ? (
					// biome-ignore lint/suspicious/noArrayIndexKey: ellipsis positions are stable per render
					<span key={`ellipsis-${i}`}>...</span>
				) : (
					<PageButton
						key={item}
						page={item}
						active={item === page}
						renderLink={renderLink}
					>
						{item}
					</PageButton>
				),
			)}
			<PageButton
				page={page + 1}
				disabled={page >= totalPages}
				renderLink={renderLink}
			>
				Next →
			</PageButton>
		</div>
	)
}

export const Table = Object.assign(Root, {
	Head,
	Body,
	Row,
	Cell,
	Pagination,
})
