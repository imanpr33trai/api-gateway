import type { Context } from "hono";

export const modelsController = async (c: Context) => {
     const modelsFile = Bun.file("./models.json");
     const modelsData = await modelsFile.json();

     const formattedModels = modelsData.models.map((model: {
          id: string;
          object?: string;
          created?: number;
          owned_by?: string;
     }) => ({
          id: model.id,
          object: "model",
          created: model.created ?? 1777625459,
          owned_by: model.owned_by ?? "library",
     }));

     return c.json({
          object: "list",
          data: formattedModels,
     });
};