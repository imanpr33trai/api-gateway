// src/controllers/models-controller.ts
import type { Context } from 'hono'

import { ZodError } from 'zod'
import { Nvidia } from '../providers/nvidia'

export class ModelsController {
  async listModels(c: Context): Promise<Response> {
    try {
      const nvidiaResp = await Nvidia.getAllModels()
      const data = await nvidiaResp.json()
      return c.json(data)
    } catch (error) {
      if(error instanceof ZodError){

      return c.json(
        {
          object: 'list',
          data: [],
          error: { message: error.message }
        },
        500
      )
      }

      return c.json(
        {
          object:'list',
          data:[],
          error
        }
      )
    }
  }
}
