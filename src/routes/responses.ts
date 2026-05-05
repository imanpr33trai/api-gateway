import { Hono } from "hono";
import { responsesController } from "../controller/responses.controller";

export const responsesRoute = new Hono();

responsesRoute.post("/responses", responsesController);