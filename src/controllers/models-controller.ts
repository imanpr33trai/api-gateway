// src/controllers/models-controller.ts
import type { Context } from "hono";
import { Nvidia } from "../providers/nvidia";

export class ModelsController {
  async listModels(c: Context): Promise<Response> {
    try {
      const nvidiaResp = await Nvidia.getAllModels();
      const data = await nvidiaResp.json();
      return c.json(data);
    } catch (error: any) {
      console.error("ModelsController error:", error);
      return c.json(
        {
          object: "list",
          data: [],
          error: { message: error.message },
        },
        500
      );
    }
  }
}
