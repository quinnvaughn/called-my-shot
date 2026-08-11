import { z } from "zod"

const envSchema = z.object({
	DATABASE_URL: z.url(),
	PORT: z.coerce.number().default(4000),
	CLIENT_ORIGIN: z.url().default("http://localhost:3000"),
	NODE_ENV: z
		.enum(["development", "production", "test"])
		.default("development"),
	ALLOW_PROD_SEED: z.coerce.boolean().default(false),
})

export const env = envSchema.parse(process.env)
