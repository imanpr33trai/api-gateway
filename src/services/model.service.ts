import { Nvidia } from '../providers/nvidia'
import type { ModelsResponse } from '../types/model.type'

export const modelService = async (): Promise<ModelsResponse> => {
  // const response = ;
  return await Nvidia.getAllModels()
}
