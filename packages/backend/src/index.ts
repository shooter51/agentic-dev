import Fastify from "fastify";

const server = Fastify({ logger: true });

server.get("/", async (_request, _reply) => {
  return { hello: "world" };
});

server.get("/health", async (_request, _reply) => {
  return { status: "ok" };
});

const start = async () => {
  const port = Number(process.env["PORT"] ?? 3001);
  try {
    await server.listen({ port, host: "0.0.0.0" });
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

start();
