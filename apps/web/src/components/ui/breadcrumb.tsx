import { createLink, type LinkComponent } from "@tanstack/react-router"
import {
	type ComponentPropsWithoutRef,
	forwardRef,
	type HTMLAttributes,
} from "react"
import { cx, sva } from "styled-system/css"

const breadcrumbRecipe = sva({
	slots: ["root", "list", "item", "linkItem", "currentItem", "link", "current"],
	base: {
		root: {
			minWidth: "0",
		},
		list: {
			display: "flex",
			alignItems: "center",
			flexWrap: "nowrap",
			minWidth: "0",
			gap: "1.5",
			textStyle: "label",
			color: "fg.subtle",
		},
		item: {
			display: "inline-flex",
			alignItems: "center",
			gap: "1.5",
			minWidth: "0",
			_before: { content: '"/"' },
			_first: { _before: { display: "none" } },
		},
		// The crumbs before the current page are the way back and need to read
		// whole, so they keep their width, up to a cap a long ballot name
		// truncates at. The current page takes whatever is left: you're already
		// on it, and the title under the trail names it.
		linkItem: {
			flexShrink: 0,
			maxWidth: "12rem",
		},
		currentItem: {
			flex: "1 1 0",
		},
		link: {
			display: "block",
			minWidth: "0",
			color: "fg.subtle",
			textDecoration: "none",
			truncate: true,
			_hover: { color: "fg.default" },
		},
		current: {
			display: "block",
			color: "fg.muted",
			truncate: true,
		},
	},
})

const slots = breadcrumbRecipe()

// The trail above a page that sits under another one (Groups / Wolfpack), so
// the way back names where it goes instead of relying on browser history.
// Link and Current each render their own <li>, so a call site is just the
// crumbs in order; the "/" between them comes from CSS, not markup. The trail
// stays on one line and shortens instead of wrapping, from the current page.
function Breadcrumb({ className, children, ...props }: HTMLAttributes<HTMLElement>) {
	return (
		<nav
			aria-label="Breadcrumb"
			className={cx(slots.root, className)}
			{...props}
		>
			<ol className={slots.list}>{children}</ol>
		</nav>
	)
}

// createLink so `to`/`params` stay typed against the route tree at each call
// site, same as Tabs.LinkTrigger.
const BreadcrumbLinkAnchor = createLink(
	forwardRef<HTMLAnchorElement, ComponentPropsWithoutRef<"a">>(
		({ className, ...props }, ref) => (
			<a ref={ref} {...props} className={cx(slots.link, className)} />
		),
	),
)

const BreadcrumbLink: LinkComponent<typeof BreadcrumbLinkAnchor> = (props) => (
	<li className={cx(slots.item, slots.linkItem)}>
		<BreadcrumbLinkAnchor {...props} />
	</li>
)

// The page you're on - not a link.
function BreadcrumbCurrent({
	className,
	...props
}: HTMLAttributes<HTMLSpanElement>) {
	return (
		<li className={cx(slots.item, slots.currentItem)}>
			<span
				aria-current="page"
				className={cx(slots.current, className)}
				{...props}
			/>
		</li>
	)
}

Breadcrumb.Link = BreadcrumbLink
Breadcrumb.Current = BreadcrumbCurrent

export { Breadcrumb }
