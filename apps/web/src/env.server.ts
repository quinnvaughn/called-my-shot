import { z } from "zod"

const envSchema = z.object({
	API_INTERNAL_URL: z.url().default("http://localhost:4000/"),
})

export const env = envSchema.parse(process.env)

// API_INTERNAL_URL includes a trailing slash (see the default above) - naive
// string concatenation with a leading-slash path produces a double slash,
// which the api's Express router doesn't match against `/share/...` and
// silently falls through to the GraphQL catch-all instead.
export function apiUrl(path: string): string {
	return `${env.API_INTERNAL_URL.replace(/\/$/, "")}${path}`
}
