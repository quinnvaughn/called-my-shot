import {
	type ButtonHTMLAttributes,
	createContext,
	type HTMLAttributes,
	type ReactNode,
	useContext,
	useEffect,
	useRef,
	useState,
} from "react"
import { cx, sva } from "styled-system/css"

const dropdownRecipe = sva({
	slots: ["root", "trigger", "content", "item"],
	base: {
		root: {
			position: "relative",
		},
		trigger: {
			display: "flex",
			alignItems: "center",
			justifyContent: "center",
			width: "8",
			height: "8",
			borderRadius: "lg",
			border: "1px solid",
			borderColor: "border.default",
			color: "fg.default",
			cursor: "pointer",
			_hover: {
				borderColor: "border.emphasized",
			},
		},
		content: {
			display: "flex",
			flexDirection: "column",
			position: "absolute",
			top: "calc(100% + 8px)",
			right: "0",
			minWidth: "44",
			gap: "0.5",
			backgroundColor: "bg.surface",
			border: "1px solid",
			borderColor: "border.default",
			borderRadius: "xl",
			padding: "1.5",
			boxShadow: "0 12px 32px rgba(0, 0, 0, 0.4)",
			zIndex: "30",
		},
		item: {
			width: "full",
			textAlign: "left",
			fontSize: "sm",
			color: "fg.default",
			borderRadius: "md",
			paddingBlock: "2.5",
			paddingInline: "3",
			cursor: "pointer",
			transition: "background-color 0.15s ease, opacity 0.15s ease",
			_hover: {
				backgroundColor: "fg.default/10",
			},
		},
	},
	variants: {
		variant: {
			default: {},
			primary: {
				item: {
					color: "primary.default",
					fontWeight: "bold",
				},
			},
		},
	},
	defaultVariants: {
		variant: "default",
	},
})

type DropdownSlots = ReturnType<typeof dropdownRecipe>

type DropdownContextValue = {
	slots: DropdownSlots
	open: boolean
	toggle: () => void
	close: () => void
}

const DropdownContext = createContext<DropdownContextValue | null>(null)

function useDropdownContext(part: string) {
	const ctx = useContext(DropdownContext)
	if (!ctx) {
		throw new Error(`Dropdown.${part} must be rendered inside <Dropdown>`)
	}
	return ctx
}

type DropdownProps = HTMLAttributes<HTMLDivElement> & {
	children: ReactNode
}

function Dropdown({ className, children, ...props }: DropdownProps) {
	const [open, setOpen] = useState(false)
	const rootRef = useRef<HTMLDivElement>(null)
	const slots = dropdownRecipe()

	const close = () => setOpen(false)
	const toggle = () => setOpen((value) => !value)

	useEffect(() => {
		if (!open) return

		function onPointerDown(event: MouseEvent) {
			if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
		}
		function onKeyDown(event: KeyboardEvent) {
			if (event.key === "Escape") setOpen(false)
		}
		document.addEventListener("mousedown", onPointerDown)
		document.addEventListener("keydown", onKeyDown)
		return () => {
			document.removeEventListener("mousedown", onPointerDown)
			document.removeEventListener("keydown", onKeyDown)
		}
	}, [open])

	return (
		<DropdownContext.Provider value={{ slots, open, toggle, close }}>
			<div ref={rootRef} className={cx(slots.root, className)} {...props}>
				{children}
			</div>
		</DropdownContext.Provider>
	)
}

type DropdownTriggerProps = Omit<
	ButtonHTMLAttributes<HTMLButtonElement>,
	"children"
> & {
	children: ReactNode | ((state: { open: boolean }) => ReactNode)
}

function DropdownTrigger({
	className,
	children,
	...props
}: DropdownTriggerProps) {
	const { slots, open, toggle } = useDropdownContext("Trigger")
	return (
		<button
			type="button"
			aria-haspopup="menu"
			aria-expanded={open}
			className={cx(slots.trigger, className)}
			onClick={toggle}
			{...props}
		>
			{typeof children === "function" ? children({ open }) : children}
		</button>
	)
}

function DropdownContent({
	className,
	...props
}: HTMLAttributes<HTMLDivElement>) {
	const { slots, open } = useDropdownContext("Content")
	if (!open) return null
	return <div role="menu" className={cx(slots.content, className)} {...props} />
}

type DropdownItemProps = ButtonHTMLAttributes<HTMLButtonElement> & {
	variant?: "default" | "primary"
}

function DropdownItem({
	className,
	variant = "default",
	onClick,
	...props
}: DropdownItemProps) {
	const { close } = useDropdownContext("Item")
	const { item } = dropdownRecipe({ variant })
	return (
		<button
			type="button"
			role="menuitem"
			className={cx(item, className)}
			onClick={(event) => {
				onClick?.(event)
				close()
			}}
			{...props}
		/>
	)
}

Dropdown.Trigger = DropdownTrigger
Dropdown.Content = DropdownContent
Dropdown.Item = DropdownItem

export { Dropdown }
