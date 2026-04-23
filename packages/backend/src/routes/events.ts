import type { FastifyInstance } from 'fastify';

export default async function eventsRoute(fastify: FastifyInstance): Promise<void> {
  fastify.get('/api/events', async (request, reply) => {
    const lastEventId = request.headers['last-event-id'] as string | undefined;

    // Tell Fastify we are managing the response manually — no auto-serialization.
    reply.hijack();

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable nginx buffering
    });

    const broadcaster = (fastify as any).sseBroadcaster;
    if (broadcaster) {
      broadcaster.addConnection(reply, lastEventId);
    }

    // Connection is kept open. Cleanup is handled inside the broadcaster via
    // the 'close' event on reply.raw.
  });
}
