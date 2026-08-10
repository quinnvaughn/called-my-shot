import { z } from "zod"

const envSchema = z.object({
	API_INTERNAL_URL: z.url().default("http://localhost:4000/"),
})

export const env = envSchema.parse(process.env)
