import {
	type ButtonHTMLAttributes,
	createContext,
	type HTMLAttributes,
	type ReactNode,
	useContext,
} from "react"
import { cx, sva } from "styled-system/css"

const tabsRecipe = sva({
	slots: ["list", "trigger"],
	base: {
		list: {
			display: "flex",
			gap: "1.5",
			padding: "1",
		},
		trigger: {
			textAlign: "center",
			fontFamily: "mono",
			fontSize: "xs",
			fontWeight: "semibold",
			letterSpacing: "wide",
			color: "fg.subtle",
			backgroundColor: "transparent",
			border: "1px solid",
			borderColor: "border.emphasized",
			borderRadius: "md",
			textTransform: "uppercase",
			padding: "{spacing.2} {spacing.3.5}",
			cursor: "pointer",
			transition:
				"background-color 0.15s ease, color 0.15s ease, border-color 0.15s ease",
			_hover: {
				color: "fg.default",
			},
		},
	},
	variants: {
		active: {
			true: {
				trigger: {
					backgroundColor: "fg.default",
					color: "bg.canvas",
					borderColor: "fg.default",
					// Base's _hover color would otherwise win here (same specificity,
					// applied after) and turn this into white-on-white.
					_hover: {
						color: "bg.canvas",
					},
				},
			},
		},
		stretch: {
			true: {
				list: {
					"& > *": {
						flex: 1,
					},
				},
			},
		},
	},
})

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

Tabs.List = TabsList
Tabs.Trigger = TabsTrigger

export { Tabs }
