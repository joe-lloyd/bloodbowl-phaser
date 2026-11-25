import type { IncomingMessage } from "node:http";
import type { Plugin } from "vite";
import { answerApi, answerSprite } from "./answer";

function fromThisPage(request: IncomingMessage): boolean {
  if (request.method === "GET") return true;
  return URL.parse(request.headers.origin ?? "")?.host === request.headers.host;
}

export function studioPlugin(): Plugin {
  return {
    name: "character-studio",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/sprites", answerSprite);
      server.middlewares.use("/studio-api", (request, response) => {
        if (fromThisPage(request)) void answerApi(request, response);
        else response.writeHead(403).end("The studio only takes changes from its own page");
      });
    },
  };
}
