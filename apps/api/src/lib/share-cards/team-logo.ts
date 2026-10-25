import { fetchDataUri } from "./remote-image"

// A team logo inlined for satori. Logos are hotlinked from the league's CDN,
// so a slow or missing one gives null and the card draws its fallback.
export function logoDataUri(url: string | null): Promise<string | null> {
	return fetchDataUri(url)
}
