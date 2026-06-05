import '@fastify/jwt'

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>
    optionalAuth: (request: FastifyRequest) => Promise<void>
  }

  interface FastifyRequest {
    userId?: string
    cbisUserId?: string
    cbisRole?: string
    cbisSubPath?: string
    apiKeyId?: string
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    user: {
      sub: string
      email: string
      role: string
    }
  }
}
