import { Hono } from "hono";
import { logger } from "hono/logger";
import { errorHandlingMiddleware } from "./middleware/error.middleware";
import { chatRoute } from "./routes/chat";
import { modelsRoute } from "./routes/models";
import { responsesRoute } from "./routes/responses";

const app = new Hono().use(logger()).use("*", errorHandlingMiddleware);

app.basePath("/v1").route("/", modelsRoute).route("/", responsesRoute);
app.basePath("/api").route("/", chatRoute);

export default {
     // port: 11434,
     fetch: app.fetch,
};
