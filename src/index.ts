import { Hono } from "hono";
import { logger } from "hono/logger";
import { errorHandlingMiddleware } from "./middleware/error.middleware";
import { chatRoute } from "./routes/chat";
import { modelsRoute } from "./routes/models";
import { responsesRoute } from "./routes/responses";
import { ollamaRoute } from "./routes/ollama";

const app = new Hono().use(logger()).use("*", errorHandlingMiddleware);

app.basePath("/v1").route("/", modelsRoute).route("/", responsesRoute).route("/", ollamaRoute);
app.basePath("/api").route("/", chatRoute);

export default {
     port: 11434,
     fetch: app.fetch,
};
