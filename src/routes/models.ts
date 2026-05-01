import { Hono } from "hono";

import { modelController } from "../controller/model.controller";

export const modelsRoute = new Hono();

modelsRoute.get("/", modelController).get("/tags", async (c) => {
     try {
          const data = await Bun.file("models.json").json();
          return c.json(data);
     } catch (error) {
          const message =
               error instanceof Error ? error.message : String(error);
          return c.json(
               { error: `Failed to read models.json, ${message}` },
               500,
          );
     }
});
