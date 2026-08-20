import { createLink, type LinkComponent } from "@tanstack/react-router"
import {
	type ButtonHTMLAttributes,
	type ComponentPropsWithoutRef,
	createContext,
	forwardRef,
	type HTMLAttributes,
	type ReactNode,
	useContext,
} from "react"
import { cx } from "styled-system/css"
import { tabs as tabsRecipe } from "styled-system/recipes"

type TabsContextValue = {
	value: string
	onValueChange: (value: string) => void
}

const TabsContext = createContext<TabsContextValue | null>(null)

function useTabsContext(part: string) {
	const ctx = useContext(TabsContext)
	if (!ctx) {
		throw new Error(`Tabs.${part} must be rendered inside <Tabs>`)
	}
	return ctx
}

type TabsProps<T extends string> = {
	value: T
	onValueChange: (value: T) => void
	children: ReactNode
}

// Controlled only — the active value always lives with the caller (e.g. a
// store), so there's no internal state here to fall out of sync with it.
function Tabs<T extends string>({
	value,
	onValueChange,
	children,
}: TabsProps<T>) {
	return (
		<TabsContext.Provider
			value={{
				value,
				onValueChange: onValueChange as (value: string) => void,
			}}
		>
			{children}
		</TabsContext.Provider>
	)
}

type TabsListProps = HTMLAttributes<HTMLDivElement> & {
	stretch?: boolean
}

function TabsList({ stretch, className, ...props }: TabsListProps) {
	const slots = tabsRecipe({ stretch })
	return <div role="tablist" className={cx(slots.list, className)} {...props} />
}

type TabsTriggerProps = Omit<
	ButtonHTMLAttributes<HTMLButtonElement>,
	"value"
> & {
	value: string
}

function TabsTrigger({ value, className, ...props }: TabsTriggerProps) {
	const { value: activeValue, onValueChange } = useTabsContext("Trigger")
	const isActive = activeValue === value
	const slots = tabsRecipe({ active: isActive })
	return (
		<button
			type="button"
			role="tab"
			aria-selected={isActive}
			className={cx(slots.trigger, className)}
			onClick={() => onValueChange(value)}
			{...props}
		/>
	)
}

// Same look as Trigger, but a real, type-safe route Link instead of a
// client-state button - for tab rows that are actually separate pages (e.g.
// admin's Teams/Players/Games), so the URL, back button, and reload all
// behave like navigation rather than throwaway UI state. Built with
// createLink so `to`/`params` stay fully typed against the route tree at
// each call site, same as the plain `Link` export.
//
// Reads `data-status` (which Link always sets, active or not) rather than
// combining separate `className`/`activeProps.className` recipe outputs -
// those are two independently-generated classes touching the same
// properties (color, background), and nothing guarantees the active one's
// declarations win the cascade over the base one's for every property.
// Resolving to a single recipe call per render sidesteps that entirely.
type TabsLinkAnchorProps = ComponentPropsWithoutRef<"a"> & {
	"data-status"?: "active"
}

const TabsLinkAnchor = createLink(
	forwardRef<HTMLAnchorElement, TabsLinkAnchorProps>((props, ref) => {
		const isActive = props["data-status"] === "active"
		return (
			<a
				ref={ref}
				{...props}
				className={tabsRecipe({ active: isActive }).trigger}
			/>
		)
	}),
)

const TabsLinkTrigger: LinkComponent<typeof TabsLinkAnchor> = (props) => (
	<TabsLinkAnchor {...props} />
)

Tabs.List = TabsList
Tabs.Trigger = TabsTrigger
Tabs.LinkTrigger = TabsLinkTrigger

export { Tabs }
