import { Hono } from "hono";
import { chatRoute } from "./routes/chat";
import { modelsRoute } from "./routes/models";

const app = new Hono();
app.route("/", chatRoute);
app.route("/models", modelsRoute);

export default app;
