import { Hono } from 'hono'

import { ModelsController } from '../controller/models.controller'

export const modelsRoute = new Hono()

modelsRoute.get('/models', new ModelsController().listModels)
