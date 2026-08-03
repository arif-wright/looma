import { listen } from '@colyseus/tools';
import { readWorldServerConfig } from './config.js';
import { createAppConfig } from './app.config.js';

const config = readWorldServerConfig();

await listen(createAppConfig(), config.port);
