import { z } from 'zod'

type RequestInit = globalThis.RequestInit

export interface HttpErrorData {
  error?: string
  message?: string
  members?: string[]
}

export class HttpError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly data?: HttpErrorData
  ) {
    super(message)
    this.name = 'HttpError'
  }
}

export class HttpClient {
  private baseUrl: string

  constructor() {
    const configuredOrigin = process.env.NODE_ENV === 'development'
      ? process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, '')
      : undefined
    const origin = configuredOrigin || (process.env.NODE_ENV === 'development' ? 'http://localhost:8787' : '')
    this.baseUrl = `${origin}/api`
  }

  async request<T>(
    endpoint: string,
    options: RequestInit = {},
    schema?: z.ZodSchema<T>
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`

    const response = await fetch(url, {
      ...options,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    })

    if (!response.ok) {
      let errorMessage: string
      let errorData: HttpErrorData | undefined
      
      try {
        const parsedErrorData: unknown = await response.json()
        if (parsedErrorData && typeof parsedErrorData === 'object') {
          errorData = parsedErrorData as HttpErrorData
        }
        if (errorData?.error) {
          errorMessage = errorData.error
        } else if (errorData?.message) {
          errorMessage = errorData.message
        } else {
          errorMessage = `HTTP error! status: ${response.status}`
        }
      } catch {
        errorMessage = '原因不明のエラーが発生しました'
      }

      switch (response.status) {
        case 401:
          errorMessage = '認証が必要です。ログインしてください。'
          break
        case 403:
          errorMessage = 'アクセスが拒否されました。権限がありません。'
          break
        case 404:
          errorMessage = 'リソースが見つかりません。'
          break
        case 500:
          errorMessage = 'サーバーエラーが発生しました。しばらくしてから再度お試しください。'
          break
        default:
          if (errorMessage === `HTTP error! status: ${response.status}`) {
            errorMessage = `リクエストに失敗しました (${response.status})`
          }
      }

      throw new HttpError(errorMessage, response.status, errorData)
    }

    const data = await response.json()

    if (schema) {
      return schema.parse(data)
    }

    return data
  }

  async get<T>(endpoint: string, schema?: z.ZodSchema<T>): Promise<T> {
    return this.request<T>(endpoint, { method: 'GET' }, schema)
  }

  async post<T>(endpoint: string, body?: unknown, schema?: z.ZodSchema<T>): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    }, schema)
  }

  async put<T>(endpoint: string, body?: unknown, schema?: z.ZodSchema<T>): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'PUT',
      body: body ? JSON.stringify(body) : undefined,
    }, schema)
  }

  async delete<T>(endpoint: string, body?: unknown, schema?: z.ZodSchema<T>): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'DELETE',
      body: body ? JSON.stringify(body) : undefined,
    }, schema)
  }
}

export const httpClient = new HttpClient()
