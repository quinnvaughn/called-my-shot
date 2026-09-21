import type { db } from "."

// The handle a db.transaction callback receives. Functions that must run
// inside their caller's transaction take one of these.
export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

// Either the pool or an open transaction, for helpers that are fine with both.
export type DbOrTx = typeof db | Tx
