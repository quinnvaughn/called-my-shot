import { z } from "zod"

// A search param that is either set or absent, like ?review=true. The router
// parses the bare value into a boolean, but a hand-built link may still carry
// it as the string "true". Any other value reads as absent.
export const searchFlag = z
	.literal([true, "true"])
	.transform(() => true as const)
	.optional()
	.catch(undefined)
