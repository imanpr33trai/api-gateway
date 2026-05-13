import { Hono } from 'hono'

import { chatController } from '../controller/chat.controller'
import { generateController } from '../controller/generate.controller'
import { tagsController } from '../controller/tags.controller'

export const chatRoute = new Hono()

chatRoute.post('/generate', generateController)
chatRoute.post('/chat', chatController)
chatRoute.get('/tags', tagsController)
