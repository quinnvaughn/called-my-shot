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

const app = express()
const httpServer = http.createServer(app)

const server = new ApolloServer({
	schema,
	plugins: [ApolloServerPluginDrainHttpServer({ httpServer })],
})

await server.start()

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
