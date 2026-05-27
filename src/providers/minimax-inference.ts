import type { AuthState } from "../types/minimax-types"

const BASE_URL = "https://api.minimax.io/anthropic"

/**
 * MiniMax inference provider.
 * Uses OAuth access_token for authentication.
 */
export const MinimaxInference = {
  async chat(req: Record<string, unknown>, authState: AuthState): Promise<Response> {
    const baseUrl = authState.inference_base_url.replace(/\/+$/, "")
    const url = `${baseUrl}/chat/completions`

    const response = await fetch(url, {
      method: "POST",
      body: JSON.stringify(req),
      headers: {
        Authorization: `Bearer ${authState.access_token}`,
        "Content-Type": "application/json",
      },
    })

    if (!response.ok) {
      const body = await response.text().catch(() => "")
      throw new Error(`MiniMax inference error ${response.status}: ${body}`)
    }

    return response
  },

  async getAllModels(authState: AuthState): Promise<Response> {
    const baseUrl = authState.inference_base_url.replace(/\/+$/, "")
    const url = `${baseUrl}/models`

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${authState.access_token}`,
      },
    })

    if (!response.ok) {
      const body = await response.text().catch(() => "")
      throw new Error(`MiniMax models error ${response.status}: ${body}`)
    }

    return response
  },
}