import { Hono } from "hono";
import { modelsController } from "../controller/models.controller";

export const modelsRoute = new Hono();

modelsRoute.get("/models", modelsController);
