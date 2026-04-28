import { Hono } from "hono";
import { chatRoute } from "./routes/chat";
import { modelsRoute } from "./routes/models";

const app = new Hono();
app.route("/", chatRoute);
app.route("/models", modelsRoute);
// Add this in src/index.ts
app.use("*", async (c, next) => {
     const start = performance.now();
     await next();
     const end = performance.now();
     console.log(
          `[${c.req.method}] ${c.req.path} - ${c.res.status} (${Math.round(end - start)}ms)`,
     );
});
// Add this in src/index.ts
app.onError((err, c) => {
     console.error("🔥 Error:", err);
     return c.json(
          {
               error: err.message || "Internal Server Error",
          },
          500,
     );
});

export default app;
