const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8787'

export const signIn = () => {
  window.location.href = `${API_BASE_URL}/auth/signin/google`
}

export const signOut = () => {
  window.location.href = `${API_BASE_URL}/auth/signout`
}

export const auth = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/auth/session`, {
      credentials: 'include',
    })
    
    if (response.ok) {
      return await response.json()
    }
    return null
  } catch (error) {
    console.error('Auth check failed:', error)
    return null
  }
}