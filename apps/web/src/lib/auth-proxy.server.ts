import { apiUrl } from "#/env.server"

// Forwards one step of the Google sign-in flow to the api and hands its
// redirect back to the browser untouched. Both steps are top-level
// navigations rather than fetches, and both set cookies (the flow cookie on
// the way out, the session on the way back), so everything that matters is
// in the Location and Set-Cookie headers.
//
// The client-ip headers are forwarded because the api records the signup's
// address against a referral, and without them it would only ever see this
// server's.
export async function proxyGoogleAuth(request: Request, path: string) {
	const search = new URL(request.url).search
	const headers = new Headers()
	for (const name of ["cookie", "fly-client-ip", "x-forwarded-for"]) {
		const value = request.headers.get(name)
		if (value) headers.set(name, value)
	}

	let upstream: Response
	try {
		upstream = await fetch(apiUrl(`${path}${search}`), {
			headers,
			redirect: "manual",
		})
	} catch {
		return Response.redirect(new URL("/?authError=google", request.url), 302)
	}

	const out = new Headers()
	const location = upstream.headers.get("location")
	if (location) out.set("location", location)
	for (const setCookie of upstream.headers.getSetCookie()) {
		out.append("set-cookie", setCookie)
	}
	return new Response(null, { status: upstream.status, headers: out })
}
