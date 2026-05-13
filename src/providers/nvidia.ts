import type { ChatCompletionRequest } from '../types'

const BASE_URL = 'https://integrate.api.nvidia.com/v1'

export const Nvidia = {
  async chat(req: ChatCompletionRequest): Promise<Response> {
    const response = await fetch(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      body: JSON.stringify(req),
      headers: {
        'Authorization': `Bearer ${process.env.NVIDIA_API_KEY}`,
        'Content-Type': 'application/json'
      }
    })

    if (!response.ok) {
      throw new Error(`API Error: ${response.statusText}`)
    }

    return response
  },

  async getAllModels(): Promise<Response> {
    const response = await fetch(`${BASE_URL}/models`)

    if (!response.ok) {
      throw new Error(`API Error: ${response.statusText}`)
    }

    return response
  }
}
