import * as React from "react"
import type { z } from "zod"
import type { useForm } from "./use-form"

// biome-ignore lint/suspicious/noExplicitAny: don't worry
type AnyZodObject = z.ZodObject<any>
type FormApiFromSchema<S extends AnyZodObject> = ReturnType<typeof useForm<S>>

export function createFormContext<S extends AnyZodObject>() {
	type Api = FormApiFromSchema<S>
	const Ctx = React.createContext<Api | null>(null)

	function FormProvider(props: { value: Api; children: React.ReactNode }) {
		return <Ctx.Provider value={props.value}>{props.children}</Ctx.Provider>
	}

	function useFormContext() {
		const v = React.useContext(Ctx)
		if (!v) throw new Error("useFormContext must be used within FormProvider")
		return v
	}

	return { FormProvider, useFormContext }
}
