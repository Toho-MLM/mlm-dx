import { z } from 'zod'

type RequestInit = globalThis.RequestInit

export class HttpClient {
  private baseUrl: string

  constructor() {
    this.baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8787'
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
      
      try {
        const errorData = await response.json()
        if (errorData.error) {
          errorMessage = errorData.error
        } else if (errorData.message) {
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

      throw new Error(errorMessage)
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

  async delete<T>(endpoint: string, schema?: z.ZodSchema<T>): Promise<T> {
    return this.request<T>(endpoint, { method: 'DELETE' }, schema)
  }
}

export const httpClient = new HttpClient()
