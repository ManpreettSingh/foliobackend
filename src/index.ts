import { createApp } from "./app.js";
import { assertRuntimeSecrets, env } from "./config/env.js";
import { StockWebSocketService } from "./services/stock-websocket.service.js";
import dns from "node:dns";

dns.setDefaultResultOrder('ipv4first');

assertRuntimeSecrets();

const app = createApp();
const server = app.listen(env.PORT, () => {
  console.log(`Folio API listening on port ${env.PORT} (CORS allowed for: ${env.CORS_ORIGIN})`);
});

StockWebSocketService.init(server);
