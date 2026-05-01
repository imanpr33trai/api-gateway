import { Hono } from "hono";

import { errorHandlingMiddleware } from "./middleware/error.middleware";
import { chatRoute } from "./routes/chat";
import { modelsRoute } from "./routes/models";

const app = new Hono();
app.get("/v1");
app.use("*", errorHandlingMiddleware);
app.route("/", chatRoute);
app.route("/v1/models", modelsRoute);

app.use("*", async (c, next) => {
     const start = performance.now();
     await next();
     const end = performance.now();
     console.log(
          `[${c.req.method}] ${c.req.path} - ${c.res.status} (${Math.round(end - start)}ms)`,
     );
});
// Add this in src/index.ts
// app.use("*", async (c, next) => {
//      const start = performance.now();
//      await next();
//      const end = performance.now();
//      console.log(
//           `[${c.req.method}] ${c.req.path} - ${c.res.status} (${Math.round(end - start)}ms)`,
// // //      );
// // });
// // Add this in src/index.ts
// app.onError((err, c) => {
//      console.error("🔥 Error:", err);
//      return c.json(
//           {
//                error: err.message || "Internal Server Error",
//           },
//           500,
//      );
// });

export default {
     port: 11434,
     fetch: app.fetch,
};
