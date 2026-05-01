import { Nvidia } from '../providers/nvidia'

export const chatService = async (prompt: string) => {
  try {
    const response = await Nvidia.generateText(prompt)
    return response
  } catch (error) {
    console.error('Error in chat service:', error)
    throw error
  }
}
