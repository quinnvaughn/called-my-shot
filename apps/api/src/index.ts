import { ApolloServer } from "@apollo/server";
import { startStandaloneServer } from "@apollo/server/standalone";
import { env } from "./env";
import { schema } from "./graphql/schema";

const server = new ApolloServer({ schema });

const { url } = await startStandaloneServer(server, {
	listen: { port: env.PORT },
});

console.log(`API ready at ${url}`);
