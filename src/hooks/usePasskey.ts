import { useState } from 'react'

const API_URL = import.meta.env.VITE_SQUIDOSS_API_URL || 'http://localhost:3000'

async function api(path: string, body?: any) {
  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  return res.json()
}

function base64urlToBuffer(base64url: string): ArrayBuffer {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/')
  const padding = '='.repeat((4 - base64.length % 4) % 4)
  return Uint8Array.from(atob(base64 + padding), c => c.charCodeAt(0)).buffer
}

function bufferToBase64url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function usePasskey() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function register(email: string): Promise<boolean> {
    setLoading(true)
    setError(null)
    try {
      const { publicKey } = await api('/auth/passkey/register/begin', { email })
      if (!publicKey) { setError('Failed to start registration'); return false }

      publicKey.challenge = base64urlToBuffer(publicKey.challenge)
      publicKey.user.id = base64urlToBuffer(publicKey.user.id)

      const credential = await navigator.credentials.create({ publicKey })
      if (!credential) { setError('Registration cancelled'); return false }

      const cred = credential as PublicKeyCredential
      const response = cred.response as AuthenticatorAttestationResponse

      const result = await api('/auth/passkey/register/complete', {
        email,
        credential: {
          id: cred.id,
          rawId: bufferToBase64url(cred.rawId),
          response: {
            clientDataJSON: bufferToBase64url(response.clientDataJSON),
            attestationObject: bufferToBase64url(response.attestationObject),
          },
          type: cred.type,
        },
      })

      if (!result.success) { setError(result.error || 'Registration failed'); return false }
      return true
    } catch (e: any) {
      setError(e.message || 'Registration failed')
      return false
    } finally {
      setLoading(false)
    }
  }

  async function authenticate(email?: string): Promise<{ token: string; user: any } | null> {
    setLoading(true)
    setError(null)
    try {
      const { publicKey } = await api('/auth/passkey/login/begin', { email })
      if (!publicKey) { setError('Failed to start authentication'); return null }

      publicKey.challenge = base64urlToBuffer(publicKey.challenge)
      if (publicKey.allowCredentials) {
        publicKey.allowCredentials = publicKey.allowCredentials.map((c: any) => ({
          ...c,
          id: base64urlToBuffer(c.id),
        }))
      }

      const credential = await navigator.credentials.get({ publicKey })
      if (!credential) { setError('Authentication cancelled'); return null }

      const cred = credential as PublicKeyCredential
      const response = cred.response as AuthenticatorAssertionResponse

      const result = await api('/auth/passkey/login/complete', {
        email,
        credential: {
          id: cred.id,
          rawId: bufferToBase64url(cred.rawId),
          response: {
            clientDataJSON: bufferToBase64url(response.clientDataJSON),
            authenticatorData: bufferToBase64url(response.authenticatorData),
            signature: bufferToBase64url(response.signature),
            userHandle: response.userHandle ? bufferToBase64url(response.userHandle) : undefined,
          },
          type: cred.type,
        },
      })

      if (!result.token) { setError(result.error || 'Authentication failed'); return null }
      return { token: result.token, user: result.user }
    } catch (e: any) {
      setError(e.message || 'Authentication failed')
      return null
    } finally {
      setLoading(false)
    }
  }

  return { register, authenticate, loading, error }
}
