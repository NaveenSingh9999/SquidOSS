import 'dotenv/config'

export const config = {
  port: parseInt(process.env.PORT || '3000'),
  host: process.env.HOST || '0.0.0.0',
  nodeEnv: process.env.NODE_ENV || 'development',
  isDev: (process.env.NODE_ENV || 'development') === 'development',

  database: {
    url: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/squidoss',
  },

  redis: {
    url: process.env.REDIS_URL || '',
  },

  jwt: {
    secret: process.env.JWT_SECRET || 'dev-secret-change-in-production',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },

  storage: {
    endpoint: process.env.STORAGE_ENDPOINT || 'http://localhost:9000',
    region: process.env.STORAGE_REGION || 'us-east-1',
    bucket: process.env.STORAGE_BUCKET || 'squidoss-files',
    accessKey: process.env.STORAGE_ACCESS_KEY || 'minioadmin',
    secretKey: process.env.STORAGE_SECRET_KEY || 'minioadmin',
  },

  cors: {
    origin: process.env.CORS_ORIGIN || true,
  },

  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000'),
    max: parseInt(process.env.RATE_LIMIT_MAX || '100'),
  },
}
