import type { Request } from "express"

// The caller's address as best it can be known from behind Fly's proxy.
//
// fly-client-ip is the only header here Fly sets itself and a client can't
// forge; x-forwarded-for is a client-controllable list and is read only as a
// fallback, taking the leftmost entry. Either way this is evidence for a
// human reviewing a suspected referral farm, never an automatic gate -
// households, phone tethering and campus wifi all put unrelated people on one
// address, and rejecting on a match would refuse exactly the friend-invites-
// friend case the product is built around.
export function clientIpOf(req: Request): string | null {
	const flyIp = req.headers["fly-client-ip"]
	if (typeof flyIp === "string" && flyIp.length > 0) return flyIp

	const forwarded = req.headers["x-forwarded-for"]
	const first = Array.isArray(forwarded) ? forwarded[0] : forwarded
	const leftmost = first?.split(",")[0]?.trim()
	if (leftmost) return leftmost

	return req.ip ?? null
}
