import { Hono } from "hono";
import { chatRoute } from "./routes/chat";

const app = new Hono();
app.route("/", chatRoute);

export default app;
