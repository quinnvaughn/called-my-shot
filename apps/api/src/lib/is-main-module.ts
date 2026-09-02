import { fileURLToPath } from "node:url"

// Lets a script export its logic for the in-process scheduler to import
// while still running standalone under `tsx path/to/file.ts` (process.argv[1]
// is that file's path only when it's the entry point, not when some other
// module imports it) - the CLI wrapper at the bottom of each such file guards
// on this instead of unconditionally calling process.exit, which would tear
// down the whole API server if the scheduler imported it.
export function isMainModule(importMetaUrl: string): boolean {
	return process.argv[1] === fileURLToPath(importMetaUrl)
}
