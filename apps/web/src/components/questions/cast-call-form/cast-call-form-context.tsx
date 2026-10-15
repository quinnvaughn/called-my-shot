import { createContext, type ReactNode, useContext } from "react"
import type { CastCallFormState } from "./use-cast-call-form"

const CastCallFormContext = createContext<CastCallFormState | null>(null)

// Hands one useCastCallForm instance to every field, card and modal under
// it, so none of them takes the form as a prop. A tree that renders outside
// its creator (a modal opened through openModal) needs its own provider
// around it with the same instance.
export function CastCallFormProvider({
	callForm,
	children,
}: {
	callForm: CastCallFormState
	children: ReactNode
}) {
	return (
		<CastCallFormContext.Provider value={callForm}>
			{children}
		</CastCallFormContext.Provider>
	)
}

export function useCastCallFormContext(): CastCallFormState {
	const callForm = useContext(CastCallFormContext)
	if (!callForm) {
		throw new Error(
			"useCastCallFormContext must be rendered inside <CastCallFormProvider>",
		)
	}
	return callForm
}
