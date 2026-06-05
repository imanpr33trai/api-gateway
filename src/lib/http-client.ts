/**
 * Simple HTTP client for OAuth token exchanges.
 */

export interface HttpResponse {
  status: number
  body: string
}

/**
 * POST application/x-www-form-urlencoded.
 */
export async function httpFormPost(
  url: string,
  data: Record<string, string>,
  extraHeaders: Record<string, string> = {}
): Promise<HttpResponse> {
  const body = new URLSearchParams(data).toString()

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json',
      ...extraHeaders
    },
    body
  })

  return {
    status: response.status,
    body: await response.text()
  }
}

/**
 * POST application/json.
 */
export async function httpJsonPost(
  url: string,
  data: Record<string, unknown>,
  extraHeaders: Record<string, string> = {}
): Promise<HttpResponse> {
  const body = JSON.stringify(data)

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...extraHeaders
    },
    body
  })

  return {
    status: response.status,
    body: await response.text()
  }
}

/**
 * GET request.
 */
export async function httpGet(
  url: string,
  extraHeaders: Record<string, string> = {}
): Promise<HttpResponse> {
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      ...extraHeaders
    }
  })

  return {
    status: response.status,
    body: await response.text()
  }
}
