// A small RFC 4180 reader for the nflverse release files: comma-separated,
// a header row, fields quoted when they hold a comma or a quote ("" escapes
// a quote inside one). Each row comes back keyed by header name.
export function parseCsv(text: string): Record<string, string>[] {
	const rows: string[][] = []
	let row: string[] = []
	let field = ""
	let quoted = false
	for (let i = 0; i < text.length; i++) {
		const char = text[i]
		if (quoted) {
			if (char === '"' && text[i + 1] === '"') {
				field += '"'
				i++
			} else if (char === '"') {
				quoted = false
			} else {
				field += char
			}
		} else if (char === '"') {
			quoted = true
		} else if (char === ",") {
			row.push(field)
			field = ""
		} else if (char === "\n" || char === "\r") {
			if (char === "\r" && text[i + 1] === "\n") i++
			row.push(field)
			rows.push(row)
			row = []
			field = ""
		} else {
			field += char
		}
	}
	if (field !== "" || row.length > 0) {
		row.push(field)
		rows.push(row)
	}
	const [header, ...body] = rows
	if (!header) return []
	return body
		.filter((cells) => cells.length > 1 || cells[0] !== "")
		.map((cells) =>
			Object.fromEntries(header.map((name, i) => [name, cells[i] ?? ""])),
		)
}
