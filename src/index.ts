import { createApp } from './app.js';
import { config } from './config/env.js';
import logger from './plugins/logger.js';

const app = await createApp();

const port = config.PORT;
const host = config.HOST;

try {
  await app.listen({ port, host });
    logger.info(`Server listening at http://${host}:${port}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
