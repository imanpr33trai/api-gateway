import { Hono } from "hono";

import { modelController } from "../controller/model.controller";

export const modelsRoute = new Hono();

modelsRoute.get("/", modelController);
