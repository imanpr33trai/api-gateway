import type { ModelsResponse } from "../providers/model.type";
import { Nvidia } from "../providers/nvidia";

export const modelService = async (): Promise<ModelsResponse> => {
   // const response = ;
   return await Nvidia.getAllModels();
};
