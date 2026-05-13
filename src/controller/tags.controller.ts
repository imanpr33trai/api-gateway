import type { Context } from 'hono'

export const tagsController = async (c: Context) => {
  const tagsFile = Bun.file('./tags.json')
  const tagsData = await tagsFile.json()
  return c.json(tagsData)
}
