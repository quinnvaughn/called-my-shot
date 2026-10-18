import { z } from "zod"

export const startChainSchema = z.object({
	groupId: z.string().uuid(),
	callId: z.string().uuid(),
})
export type StartChainInput = z.infer<typeof startChainSchema>

export const requestChainLinkSchema = z.object({
	chainId: z.string().uuid(),
	callId: z.string().uuid(),
})
export type RequestChainLinkInput = z.infer<typeof requestChainLinkSchema>
