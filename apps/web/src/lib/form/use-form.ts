import { useStore } from "@tanstack/react-store"
import { Store } from "@tanstack/store"
import type React from "react"
import { useEffect, useRef, useState } from "react"
import { z } from "zod"

/** ======================================================================================
 * Types: Path + PathValue
 * ===================================================================================== */

type Primitive =
	| string
	| number
	| boolean
	| null
	| undefined
	| symbol
	| bigint
	| Date

type Key = string | number

export type Updater<T> = T | ((prev: T) => T)

export type Path<T> = T extends Primitive
	? never
	: T extends (infer U)[]
		? `${number}` | `${number}.${Path<U>}`
		: {
				[K in Extract<keyof T, Key>]: T[K] extends Primitive
					? `${K}`
					: T[K] extends (infer U)[]
						? `${K}` | `${K}.${number}` | `${K}.${number}.${Path<U>}`
						: `${K}` | `${K}.${Path<T[K]>}`
			}[Extract<keyof T, Key>]

export type PathValue<
	T,
	P extends string,
> = P extends `${infer Head}.${infer Tail}`
	? Head extends `${number}`
		? T extends (infer U)[]
			? PathValue<U, Tail>
			: never
		: Head extends keyof T
			? PathValue<T[Head], Tail>
			: never
	: P extends `${number}`
		? T extends (infer U)[]
			? U
			: never
		: P extends keyof T
			? T[P]
			: never

export type ArrayPath<T> = {
	[P in Path<T>]: PathValue<T, P> extends any[] ? P : never
}[Path<T>]

export type ArrayItem<T, P extends ArrayPath<T>> =
	PathValue<T, P> extends (infer U)[] ? U : never

/** ======================================================================================
 * Runtime helpers: getIn / setIn
 * ===================================================================================== */

function splitPath(path: string): (string | number)[] {
	return path.split(".").map((seg) => {
		const n = Number(seg)
		return Number.isInteger(n) && String(n) === seg ? n : seg
	})
}

function getIn(obj: any, path: string) {
	if (!path) return obj
	const parts = splitPath(path)
	let cur = obj
	for (const p of parts) {
		if (cur == null) return undefined
		cur = cur[p as any]
	}
	return cur
}

function setIn(obj: any, path: string, value: any) {
	const parts = splitPath(path)
	if (parts.length === 0) return obj

	const root = Array.isArray(obj) ? [...obj] : { ...obj }
	let cur: any = root

	for (let i = 0; i < parts.length - 1; i++) {
		const key = parts[i]
		const nextKey = parts[i + 1]
		const existing = cur[key as any]

		let nextContainer: any
		if (existing == null) {
			nextContainer = typeof nextKey === "number" ? [] : {}
		} else {
			nextContainer = Array.isArray(existing) ? [...existing] : { ...existing }
		}

		cur[key as any] = nextContainer
		cur = nextContainer
	}

	const last = parts[parts.length - 1]
	cur[last as any] = value
	return root
}

/** ======================================================================================
 * Deep equality — used for isDirty
 * ===================================================================================== */

function deepEqual(a: any, b: any): boolean {
	if (a === b) return true
	if (a == null || b == null) return a === b
	if (typeof a !== typeof b) return false
	if (typeof a !== "object") return false
	if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime()
	if (Array.isArray(a) !== Array.isArray(b)) return false
	if (Array.isArray(a)) {
		if (a.length !== b.length) return false
		return a.every((v, i) => deepEqual(v, b[i]))
	}
	const aKeys = Object.keys(a)
	const bKeys = Object.keys(b)
	if (aKeys.length !== bKeys.length) return false
	return aKeys.every((k) => deepEqual(a[k], b[k]))
}

/** ======================================================================================
 * Error + touched helpers (path-based)
 * ===================================================================================== */

function joinPath(parts: PropertyKey[]) {
	return parts
		.map((p) =>
			typeof p === "symbol" ? (p.description ?? String(p)) : String(p),
		)
		.join(".")
}

function issuesToErrorMap(issues: z.core.$ZodIssue[]): Record<string, string> {
	const out: Record<string, string> = {}
	for (const issue of issues) {
		const key = joinPath(issue.path)
		if (!out[key]) out[key] = issue.message
	}
	return out
}

function collectAllPaths(value: any, prefix = ""): string[] {
	const out: string[] = []

	const push = (p: string) => {
		if (p) out.push(p)
	}

	if (value == null) {
		push(prefix)
		return out
	}

	if (Array.isArray(value)) {
		push(prefix)
		for (let i = 0; i < value.length; i++) {
			const p = prefix ? `${prefix}.${i}` : `${i}`
			out.push(...collectAllPaths(value[i], p))
		}
		return out
	}

	if (typeof value === "object" && !(value instanceof Date)) {
		push(prefix)
		for (const k of Object.keys(value)) {
			const p = prefix ? `${prefix}.${k}` : k
			out.push(...collectAllPaths(value[k], p))
		}
		return out
	}

	push(prefix)
	return out
}

/** ======================================================================================
 * Public helpers types
 * ===================================================================================== */

type ArrayHelpers<Item> = {
	push: (item: Item) => void
	insert: (index: number, item: Item) => void
	remove: (index: number) => void
	swap: (a: number, b: number) => void
	replace: (items: Item[]) => void
}

type FormState<Values> = {
	values: Values
	errors: Record<string, string | null>
	touched: Record<string, boolean>
	meta: {
		isSubmitting: boolean
		submitCount: number
		canSubmit: boolean
		isDirty: boolean
		formError: string | null
	}
}

export interface UseFormHelpers<Values> {
	reset(valuesOverride?: Partial<Values>): void
	setValue<P extends Path<Values>>(
		name: P,
		next: Updater<PathValue<Values, P>>,
	): void

	setError(path: string, message: string | null): void
	setErrors(errorsMap: Record<string, string | null>): void
	clearErrors(): void

	setTouched(path: string, touched: boolean): void
	setAllTouched(): void

	setFormError(message: string | null, timeoutInMs?: number): void
	clearFormError(): void

	array<P extends ArrayPath<Values>>(
		name: P,
	): ArrayHelpers<ArrayItem<Values, P>>
}

type AnyObject = Record<string, any>

export type FormHelpersFromSchema<S extends z.ZodType<AnyObject>> =
	UseFormHelpers<z.infer<S>>

/** ======================================================================================
 * useForm
 * ===================================================================================== */

export function useForm<Schema extends z.ZodType<AnyObject>>(opts: {
	schema: Schema
	defaultValues?: Partial<z.output<Schema>>
	onSubmit?: (
		values: z.output<Schema>,
		helpers: UseFormHelpers<z.output<Schema>>,
	) => Promise<void> | void
}) {
	type Values = z.output<Schema>

	const schemaRef = useRef(opts.schema)
	useEffect(() => {
		schemaRef.current = opts.schema
	}, [opts.schema])

	const onSubmitRef = useRef(opts.onSubmit)
	useEffect(() => {
		onSubmitRef.current = opts.onSubmit
	}, [opts.onSubmit])

	const [formApi] = useState(() => {
		const defaults = opts.defaultValues ?? {}
		const schema = opts.schema

		const parsedFromDefaults = schema.safeParse(defaults)

		let initialValues: Values

		if (parsedFromDefaults.success) {
			initialValues = parsedFromDefaults.data
		} else if (schema instanceof z.ZodObject) {
			const shape = schema.shape

			initialValues = Object.fromEntries(
				Object.keys(shape).map((key) => {
					const field = shape[key as keyof typeof shape]
					const hasExplicitDefault = Object.hasOwn(defaults, key)

					if (hasExplicitDefault) {
						return [key, defaults[key as keyof typeof defaults] as any]
					}

					if (field instanceof z.ZodString) return [key, ""]
					if (field instanceof z.ZodNumber) return [key, 0]
					if (field instanceof z.ZodBoolean) return [key, false]
					if (field instanceof z.ZodArray) return [key, []]
					if (field instanceof z.ZodObject) return [key, {}]
					if (field instanceof z.ZodNullable) return [key, null]

					return [key, undefined]
				}),
			) as Values
		} else {
			initialValues = defaults as Values
		}

		const initialParse = schema.safeParse(initialValues)
		const initialErrors: Record<string, string | null> = initialParse.success
			? {}
			: Object.fromEntries(
					Object.entries(issuesToErrorMap(initialParse.error.issues)).map(
						([k, v]) => [k, v],
					),
				)

		const store = new Store<FormState<Values>>({
			values: initialValues,
			errors: initialErrors,
			touched: {},
			meta: {
				isSubmitting: false,
				submitCount: 0,
				canSubmit: initialParse.success,
				isDirty: false,
				formError: null,
			},
		})

		const arrayIds = new Map<string, string[]>()

		function createId() {
			return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`
		}

		function getOrCreateIds(path: string, arr: any[]): string[] {
			let ids = arrayIds.get(path)
			if (!ids) {
				ids = arr.map(() => createId())
				arrayIds.set(path, ids)
			}
			while (ids.length < arr.length) ids.push(createId())
			return ids.slice(0, arr.length)
		}

		const computeCanSubmit = (errors: Record<string, string | null>) =>
			!Object.values(errors).some((e) => e != null)

		const computeIsDirty = (values: Values) => !deepEqual(values, initialValues)

		const validateAll = () => {
			const state = store.state
			const res = schemaRef.current.safeParse(state.values)

			store.setState((prev) => {
				const nextErrors: Record<string, string | null> = res.success
					? {}
					: Object.fromEntries(
							Object.entries(issuesToErrorMap(res.error.issues)).map(
								([k, v]) => [k, v],
							),
						)

				return {
					...prev,
					errors: nextErrors,
					meta: {
						...prev.meta,
						canSubmit: computeCanSubmit(nextErrors),
						isDirty: computeIsDirty(prev.values),
					},
				}
			})

			return res
		}

		const reset = (valuesOverride?: Partial<Values>) => {
			const merged = { ...initialValues, ...valuesOverride } as any
			const res = schemaRef.current.safeParse(merged)
			const values = (res.success ? res.data : (merged as Values)) as Values

			arrayIds.clear()

			store.setState(() => {
				const nextErrors: Record<string, string | null> = res.success
					? {}
					: Object.fromEntries(
							Object.entries(issuesToErrorMap(res.error.issues)).map(
								([k, v]) => [k, v],
							),
						)

				return {
					values,
					errors: nextErrors,
					touched: {},
					meta: {
						isSubmitting: false,
						submitCount: 0,
						canSubmit: computeCanSubmit(nextErrors),
						isDirty: computeIsDirty(values),
						formError: null,
					},
				}
			})
		}

		const setValue = <P extends Path<Values>>(
			name: P,
			next: Updater<PathValue<Values, P>>,
		) => {
			const nameStr = name as string

			store.setState((prev) => {
				const prevVal = getIn(prev.values, nameStr) as PathValue<Values, P>
				const value =
					typeof next === "function"
						? (next as (p: PathValue<Values, P>) => PathValue<Values, P>)(
								prevVal,
							)
						: next

				const values = setIn(prev.values, nameStr, value) as Values
				return {
					...prev,
					values,
					meta: {
						...prev.meta,
						isDirty: computeIsDirty(values),
					},
				}
			})

			validateAll()
		}

		const setError = (path: string, message: string | null) => {
			store.setState((prev) => {
				const errors = { ...prev.errors, [path]: message }
				return {
					...prev,
					errors,
					meta: { ...prev.meta, canSubmit: computeCanSubmit(errors) },
				}
			})
		}

		const setErrors = (errorsMap: Record<string, string | null>) => {
			store.setState((prev) => ({
				...prev,
				errors: errorsMap,
				meta: { ...prev.meta, canSubmit: computeCanSubmit(errorsMap) },
			}))
		}

		const clearErrors = () => {
			store.setState((prev) => ({
				...prev,
				errors: {},
				meta: { ...prev.meta, canSubmit: true },
			}))
		}

		const setTouched = (path: string, touched: boolean) => {
			store.setState((prev) => ({
				...prev,
				touched: { ...prev.touched, [path]: touched },
			}))
		}

		const setAllTouched = () => {
			store.setState((prev) => {
				const paths = collectAllPaths(prev.values)
				const touched = { ...prev.touched }
				for (const p of paths) touched[p] = true
				return { ...prev, touched }
			})
		}

		const formErrorTimeout = {
			current: null as ReturnType<typeof setTimeout> | null,
		}

		const clearFormError = () => {
			store.setState((prev) => ({
				...prev,
				meta: { ...prev.meta, formError: null },
			}))
		}

		const setFormError = (message: string | null, timeoutInMs?: number) => {
			if (formErrorTimeout.current != null) {
				clearTimeout(formErrorTimeout.current)
				formErrorTimeout.current = null
			}

			store.setState((prev) => ({
				...prev,
				meta: { ...prev.meta, formError: message },
			}))

			if (timeoutInMs) {
				formErrorTimeout.current = setTimeout(() => {
					formErrorTimeout.current = null
					clearFormError()
				}, timeoutInMs)
			}
		}

		function array<P extends ArrayPath<Values>>(
			name: P,
		): ArrayHelpers<ArrayItem<Values, P>> {
			type Item = ArrayItem<Values, P>

			const nameStr = name as string
			const toArray = (v: any): Item[] =>
				Array.isArray(v) ? (v as Item[]) : []

			const setArrayValue = (next: Updater<Item[]>) => {
				setTouched(nameStr, true)
				setValue(name as any, next as any)
			}

			const helpers: ArrayHelpers<Item> = {
				push: (item) => {
					const ids = arrayIds.get(nameStr) ?? []
					arrayIds.set(nameStr, [...ids, createId()])
					setArrayValue((prev: any) => [...toArray(prev), item] as any)
				},

				insert: (index, item) => {
					const ids = arrayIds.get(nameStr) ?? []
					arrayIds.set(nameStr, [
						...ids.slice(0, index),
						createId(),
						...ids.slice(index),
					])
					setArrayValue((prev: any) => {
						const arr = toArray(prev)
						return [...arr.slice(0, index), item, ...arr.slice(index)] as any
					})
				},

				remove: (index) => {
					const ids = arrayIds.get(nameStr) ?? []
					arrayIds.set(
						nameStr,
						ids.filter((_, i) => i !== index),
					)
					setArrayValue(
						(prev: any) => toArray(prev).filter((_, i) => i !== index) as any,
					)
				},

				swap: (a, b) => {
					const ids = [...(arrayIds.get(nameStr) ?? [])]
					;[ids[a], ids[b]] = [ids[b], ids[a]]
					arrayIds.set(nameStr, ids)
					setArrayValue((prev: any) => {
						const arr = [...toArray(prev)]
						;[arr[a], arr[b]] = [arr[b], arr[a]]
						return arr as any
					})
				},

				replace: (items) => {
					arrayIds.set(
						nameStr,
						items.map(() => createId()),
					)
					setArrayValue(items as any)
				},
			}

			return helpers
		}

		const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
			e.preventDefault()

			setAllTouched()

			const res = validateAll()
			if (!res.success) return

			store.setState((prev) => ({
				...prev,
				meta: {
					...prev.meta,
					isSubmitting: true,
					submitCount: prev.meta.submitCount + 1,
				},
			}))

			try {
				if (onSubmitRef.current)
					await onSubmitRef.current(res.data, {
						reset,
						setValue,
						setError,
						setErrors,
						clearErrors,
						setTouched,
						setAllTouched,
						setFormError,
						clearFormError,
						array,
					})
			} finally {
				store.setState((prev) => ({
					...prev,
					meta: { ...prev.meta, isSubmitting: false },
				}))
			}
		}

		function Subscribe<T>(props: {
			selector: (s: FormState<Values>) => T
			children: (sel: T) => React.ReactNode
		}) {
			const selected = useStore(store, (s) =>
				props.selector({
					values: s.values,
					errors: s.errors,
					touched: s.touched,
					meta: {
						isSubmitting: s.meta.isSubmitting,
						submitCount: s.meta.submitCount,
						canSubmit: computeCanSubmit(s.errors),
						isDirty: computeIsDirty(s.values),
						formError: s.meta.formError,
					},
				}),
			)
			return props.children(selected)
		}

		function useWatch<P extends Path<Values>>(name: P): PathValue<Values, P> {
			const nameStr = name as string
			return useStore(
				store,
				(s) => getIn(s.values, nameStr) as PathValue<Values, P>,
			)
		}

		function Field<P extends Path<Values>>(props: {
			name: P
			children: (field: {
				name: P
				value: PathValue<Values, P>
				onChange: (
					next:
						| PathValue<Values, P>
						| React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
				) => void
				onBlur: () => void
				meta: { error: string | null; touched: boolean }
			}) => React.ReactNode
		}) {
			const { name, children } = props
			const nameStr = name as string

			const { value, error, touched } = useStore(store, (s) => {
				const v = getIn(s.values, nameStr) as PathValue<Values, P>
				return {
					value: v,
					error: s.errors[nameStr] ?? null,
					touched: s.touched[nameStr] ?? false,
				}
			})

			return children({
				name,
				value,
				onChange: (next) => {
					let v: any

					if (typeof next === "object" && next != null && "target" in next) {
						const t = next.target as HTMLInputElement | HTMLTextAreaElement
						if (t instanceof HTMLInputElement && t.type === "checkbox") {
							v = t.checked
						} else {
							v = t.value
						}
					} else {
						v = next
					}

					setValue(name, v)
				},
				onBlur: () => {
					setTouched(nameStr, true)
					validateAll()
				},
				meta: { error: touched ? error : null, touched },
			})
		}

		function FieldArray<P extends ArrayPath<Values>>(props: {
			name: P
			children: (arrayField: {
				name: P
				value: PathValue<Values, P>
				items: {
					index: number
					value: ArrayItem<Values, P>
					id: string
				}[]
				meta: { error: string | null; touched: boolean }
				helpers: ArrayHelpers<ArrayItem<Values, P>>
			}) => React.ReactNode
		}) {
			const { name, children } = props
			const nameStr = name as string

			const { value, error, touched } = useStore(store, (s) => {
				const v = getIn(s.values, nameStr) as PathValue<Values, P>
				return {
					value: v,
					error: s.errors[nameStr] ?? null,
					touched: s.touched[nameStr] ?? false,
				}
			})

			type Item = ArrayItem<Values, P>
			const arr = (Array.isArray(value) ? (value as Item[]) : []) as Item[]
			const ids = getOrCreateIds(nameStr, arr)
			const items = arr.map((v, idx) => ({
				index: idx,
				value: v,
				id: ids[idx],
			}))

			return children({
				name,
				value,
				items,
				meta: { error: touched ? error : null, touched },
				helpers: array(name),
			})
		}

		const values = () => store.state.values
		const errors = () => store.state.errors
		const meta = () => {
			const s = store.state
			return {
				isSubmitting: s.meta.isSubmitting,
				submitCount: s.meta.submitCount,
				canSubmit: computeCanSubmit(s.errors),
				isDirty: computeIsDirty(s.values),
				formError: s.meta.formError,
			}
		}

		return {
			Field,
			FieldArray,
			Subscribe,
			useWatch,

			reset,
			setValue,
			setError,
			setErrors,
			clearErrors,
			setTouched,
			setAllTouched,
			setFormError,
			clearFormError,
			array,

			values,
			errors,
			meta,
			handleSubmit,
		}
	})

	return formApi
}
