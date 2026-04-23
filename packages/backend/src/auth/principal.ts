import 'fastify';
import type { preHandlerHookHandler } from 'fastify';
import type { AuthPrincipal, UserRole } from '@agentic-dev/shared';
import type { AuthService } from './auth.service.js';

declare module 'fastify' {
  interface FastifyRequest {
    principal?: AuthPrincipal;
  }
  interface FastifyInstance {
    auth: AuthService;
    authenticate: preHandlerHookHandler;
    authorize: (roles: UserRole[]) => preHandlerHookHandler;
  }
}
