import { sign, verify } from 'hono/jwt';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  image?: string;
}

export interface CustomJWTPayload {
  sub: string;
  email: string;
  name: string;
  picture?: string;
  iat: number;
  exp: number;
}

export function generateState(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function generateJWT(user: AuthUser, secret: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    sub: user.id,
    email: user.email,
    name: user.name,
    picture: user.image,
    iat: now,
    exp: now + (7 * 24 * 60 * 60),
  };
  
  return await sign(payload, secret);
}

export async function verifyJWT(token: string, secret: string): Promise<any | null> {
  try {
    const payload = await verify(token, secret);
    return payload;
  } catch (error) {
    console.error('JWT verification failed:', error);
    return null;
  }
}

export async function getGoogleUserInfo(accessToken: string): Promise<AuthUser | null> {
  try {
    const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Google API error: ${response.status}`);
    }

    const userInfo = await response.json() as any;
    
    return {
      id: userInfo.id,
      email: userInfo.email,
      name: userInfo.name,
      image: userInfo.picture,
    };
  } catch (error) {
    console.error('Failed to get Google user info:', error);
    return null;
  }
}

export async function exchangeCodeForToken(code: string, clientId: string, clientSecret: string, redirectUri: string): Promise<{ accessToken: string; idToken?: string } | null> {
  try {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    if (!response.ok) {
      throw new Error(`Token exchange failed: ${response.status}`);
    }

    const tokenData = await response.json() as any;
    
    return {
      accessToken: tokenData.access_token,
      idToken: tokenData.id_token,
    };
  } catch (error) {
    console.error('Token exchange failed:', error);
    return null;
  }
}

export function createGoogleAuthUrl(clientId: string, redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    access_type: 'offline',
    prompt: 'consent',
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}