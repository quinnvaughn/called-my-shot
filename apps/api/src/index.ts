import http from "node:http"
import { ApolloServer } from "@apollo/server"
import { ApolloServerPluginDrainHttpServer } from "@apollo/server/plugin/drainHttpServer"
import { expressMiddleware } from "@as-integrations/express5"
import cookieParser from "cookie-parser"
import cors from "cors"
import express from "express"
import { env } from "./env"
import { createContext } from "./graphql/context"
import { schema } from "./graphql/schema"
import { registerShareRoutes } from "./routes/share"

const app = express()
const httpServer = http.createServer(app)

const server = new ApolloServer({
	schema,
	plugins: [ApolloServerPluginDrainHttpServer({ httpServer })],
})

await server.start()

// Registered before the catch-all GraphQL mount below (which matches every
// path under "/") so these plain REST routes get handled directly instead
// of falling into Apollo's Express middleware.
app.use("/share", cors({ origin: env.CLIENT_ORIGIN }))
registerShareRoutes(app)

app.use(
	"/",
	cors({ origin: env.CLIENT_ORIGIN, credentials: true }),
	express.json(),
	cookieParser(),
	expressMiddleware(server, { context: createContext }),
)

await new Promise<void>((resolve) => {
	httpServer.listen({ port: env.PORT }, resolve)
})

console.log(`API ready at http://localhost:${env.PORT}`)
