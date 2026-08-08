import { z } from "zod";

const envSchema = z.object({
	DATABASE_URL: z.url(),
	PORT: z.coerce.number().default(4000),
});

export const env = envSchema.parse(process.env);
