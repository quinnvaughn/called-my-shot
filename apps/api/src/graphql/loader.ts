import DataLoader from "dataloader"
import type { Context } from "./context"

// A request-scoped DataLoader: every field that asks for the same kind of
// fact during one request shares one instance, so their keys go out as a
// single batched query. `batch` must return one value per key, in key order.
export function ctxLoader<K, V, C = K>(
	batch: (keys: K[], ctx: Context) => Promise<V[]>,
	options?: DataLoader.Options<K, V, C>,
): (ctx: Context) => DataLoader<K, V, C> {
	const loaders = new WeakMap<Context, DataLoader<K, V, C>>()
	return (ctx) => {
		let loader = loaders.get(ctx)
		if (!loader) {
			loader = new DataLoader<K, V, C>((keys) => batch([...keys], ctx), options)
			loaders.set(ctx, loader)
		}
		return loader
	}
}

// Every row for each key, in key order - an empty list for a key with none.
export function groupByKey<K, T>(
	keys: readonly K[],
	rows: T[],
	keyOf: (row: T) => K,
): T[][] {
	const byKey = new Map<K, T[]>()
	for (const row of rows) {
		const key = keyOf(row)
		const list = byKey.get(key)
		if (list) list.push(row)
		else byKey.set(key, [row])
	}
	return keys.map((key) => byKey.get(key) ?? [])
}

// The one row for each key, in key order - `fallback` for a key with none.
export function indexByKey<K, T, F>(
	keys: readonly K[],
	rows: T[],
	keyOf: (row: T) => K,
	fallback: F,
): (T | F)[] {
	const byKey = new Map(rows.map((row) => [keyOf(row), row]))
	return keys.map((key) => byKey.get(key) ?? fallback)
}
