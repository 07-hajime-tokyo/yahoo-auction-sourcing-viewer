import { createServer } from "node:http";
import next from "next";

const args = process.argv.slice(2);
const portIndex = args.findIndex((arg) => arg === "--port" || arg === "-p");
const port =
  portIndex >= 0 && args[portIndex + 1]
    ? Number(args[portIndex + 1])
    : Number(process.env.PORT || 3000);
const hostname = process.env.HOSTNAME || "localhost";

if (!Number.isInteger(port) || port <= 0) {
  throw new Error(`Invalid port: ${String(port)}`);
}

const app = next({ dev: true, hostname, port });
const handle = app.getRequestHandler();

await app.prepare();

createServer((request, response) => {
  handle(request, response);
}).listen(port, hostname, () => {
  console.log(`> Ready on http://${hostname}:${port}`);
});
