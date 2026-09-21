import { type ParseArgsOptionsConfig, parseArgs } from "node:util"

// Parses a script's --flags strictly: an unknown flag, a stray positional or a
// string flag with no value is an error instead of being silently ignored.
//
// `pnpm --filter api <script> -- --commit` forwards the `--` itself to the
// script, and parseArgs treats everything after a `--` as positional, so it's
// dropped before parsing.
export function parseFlags<const T extends ParseArgsOptionsConfig>(
	options: T,
) {
	return parseArgs({
		args: process.argv.slice(2).filter((arg) => arg !== "--"),
		options,
		strict: true,
		allowPositionals: false,
	}).values
}
