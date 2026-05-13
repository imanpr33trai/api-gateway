import { Hono } from 'hono'

import { ModelsController } from '../controller/models.controller'

export const modelsRoute = new Hono()

modelsRoute.get('/v1/models', new ModelsController().listModels)
