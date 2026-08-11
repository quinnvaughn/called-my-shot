import {
	createContext,
	type HTMLAttributes,
	type ReactNode,
	type TableHTMLAttributes,
	type TdHTMLAttributes,
	useContext,
} from "react"
import { FiChevronDown, FiChevronUp } from "react-icons/fi"
import { css, cx } from "styled-system/css"

type SortDir = "asc" | "desc"

// Untyped at the context boundary (Key erased to string) so one context can
// back a `<Table>` for any column key union — each call site gets its own
// typed `sortBy`/`onSort` back through the generic root props.
type TableContextValue = {
	sortBy: string
	sortDir: SortDir
	onSort?: (key: string) => void
}

const TableContext = createContext<TableContextValue | null>(null)

function useTableContext(part: string) {
	const ctx = useContext(TableContext)
	if (!ctx) {
		throw new Error(`Table.${part} must be rendered inside <Table>`)
	}
	return ctx
}

const wrapperStyle = css({
	width: "full",
	overflowX: "auto",
})

const tableStyle = css({
	width: "full",
	minWidth: "600px",
	borderCollapse: "collapse",
	fontFamily: "body",
	backgroundColor: "bg.surface",
	border: "1px solid",
	borderColor: "border.default",
	borderRadius: "2xl",
	overflow: "hidden",
})

function headerCellStyle(
	isActive: boolean,
	sortable: boolean,
	numeric: boolean,
) {
	return css({
		color: isActive ? "primary.default" : "fg.subtle",
		fontFamily: "mono",
		fontSize: "2xs",
		letterSpacing: "wide",
		textTransform: "uppercase",
		opacity: isActive ? "1" : "0.8",
		cursor: sortable ? "pointer" : "default",
		borderBottom: "1px solid",
		borderColor: "border.default",
		userSelect: "none",
		whiteSpace: "nowrap",
		// Numeric headers center to sit over their centered cells (see Cell's
		// `numeric` prop) — left-aligning them here would let the header label
		// drift away from its own column's values as the column stretches
		// wider than the label.
		textAlign: numeric ? "center" : "left",
		padding: "3.5",
	})
}

const headerLabelStyle = css({
	display: "inline-flex",
	alignItems: "center",
	gap: "1",
	whiteSpace: "nowrap",
})

const cellStyle = css({
	fontSize: "sm",
	color: "fg.default",
	borderBottom: "1px solid",
	borderColor: "border.default",
	whiteSpace: "nowrap",
	padding: "3.5",
})

const numericCellStyle = css({
	textAlign: "right",
})

type TableProps<Key extends string> = TableHTMLAttributes<HTMLTableElement> & {
	sortBy: Key
	sortDir: SortDir
	onSort?: (key: Key) => void
}

function Root<Key extends string>({
	sortBy,
	sortDir,
	onSort,
	className,
	children,
	...props
}: TableProps<Key>) {
	return (
		<TableContext.Provider
			value={{ sortBy, sortDir, onSort: onSort as TableContextValue["onSort"] }}
		>
			{/* Explicit width here, not just on the table — inside a flex parent
			with alignItems: "flex-start" (VStack/HStack's default), a plain
			block div shrinks to fit its content instead of stretching, which
			silently defeats width: "full" on the table itself. */}
			<div className={wrapperStyle}>
				<table className={cx(tableStyle, className)} {...props}>
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
}

function Head<Key extends string>({
	columns,
}: {
	columns: TableColumn<Key>[]
}) {
	const { sortBy, sortDir, onSort } = useTableContext("Head")

	return (
		<thead>
			<tr>
				{columns.map(({ key, label, sortable = true, numeric = false }) => {
					const isActive = sortable && sortBy === key
					const canSort = sortable && !!onSort
					const Icon =
						isActive && sortDir === "asc" ? FiChevronUp : FiChevronDown

					return (
						<th
							key={key}
							onClick={canSort ? () => onSort?.(key) : undefined}
							className={headerCellStyle(isActive, canSort, numeric)}
						>
							<span className={headerLabelStyle}>
								{label}
								{sortable && <Icon />}
							</span>
						</th>
					)
				})}
			</tr>
		</thead>
	)
}

function Body({
	className,
	...props
}: HTMLAttributes<HTMLTableSectionElement>) {
	return <tbody className={className} {...props} />
}

function Row({ className, ...props }: HTMLAttributes<HTMLTableRowElement>) {
	return <tr className={className} {...props} />
}

type CellProps = TdHTMLAttributes<HTMLTableCellElement> & {
	numeric?: boolean
}

function Cell({ numeric, className, ...props }: CellProps) {
	return (
		<td
			className={cx(cellStyle, numeric && numericCellStyle, className)}
			{...props}
		/>
	)
}

// --- Pagination ---

const pageButtonStyle = css({
	display: "inline-flex",
	alignItems: "center",
	justifyContent: "center",
	minWidth: "9",
	height: "9",
	paddingInline: "3",
	borderRadius: "lg",
	border: "1px solid",
	borderColor: "border.default",
	fontFamily: "mono",
	fontSize: "sm",
	backgroundColor: "bg.surface",
	color: "fg.default",
})

const pageActiveStyle = css({
	backgroundColor: "primary.default",
	color: "primary.contrast",
	borderColor: "primary.default",
})

const pageDisabledStyle = css({
	opacity: "0.4",
	cursor: "not-allowed",
})

const pageLinkStyle = css({
	cursor: "pointer",
	_hover: { borderColor: "primary.default" },
})

const paginationRowStyle = css({
	display: "flex",
	alignItems: "center",
	justifyContent: "center",
	gap: "3",
	paddingTop: "6",
})

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
		return (
			<span className={cx(pageButtonStyle, pageActiveStyle)}>{children}</span>
		)
	}

	if (disabled) {
		return (
			<span className={cx(pageButtonStyle, pageDisabledStyle)}>{children}</span>
		)
	}

	return <>{renderLink(page, children, cx(pageButtonStyle, pageLinkStyle))}</>
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
	return (
		<div className={paginationRowStyle}>
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
