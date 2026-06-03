/**
 * WebAuthn Passkey Utilities for SquidVault
 * Handles biometric authentication using the WebAuthn API
 */

export interface PasskeyRegistrationResult {
  credentialId: string;
  publicKey: string;
}

/**
 * Check if the device supports WebAuthn passkeys
 */
export async function isPasskeyAvailable(): Promise<boolean> {
  if (!window.PublicKeyCredential) {
    return false;
  }

  try {
    const available = await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    return available;
  } catch (error) {
    console.error('Error checking passkey availability:', error);
    return false;
  }
}

/**
 * Register a new passkey for the vault
 */
export async function registerPasskey(
  userId: string,
  vaultName: string
): Promise<PasskeyRegistrationResult | null> {
  try {
    // Generate a random challenge
    const challenge = new Uint8Array(32);
    crypto.getRandomValues(challenge);

    // Create passkey credential options
    const publicKeyCredentialCreationOptions: PublicKeyCredentialCreationOptions = {
      challenge: challenge,
      rp: {
        name: "SquidVault",
        id: window.location.hostname,
      },
      user: {
        id: new TextEncoder().encode(userId),
        name: vaultName,
        displayName: vaultName,
      },
      pubKeyCredParams: [
        { alg: -7, type: "public-key" },   // ES256 (Elliptic Curve)
        { alg: -257, type: "public-key" }, // RS256 (RSA)
      ],
      authenticatorSelection: {
        authenticatorAttachment: "platform", // Use platform authenticator (Touch ID, Face ID, Windows Hello)
        userVerification: "required",        // Require biometric verification
        requireResidentKey: false,
      },
      timeout: 60000, // 60 seconds
      attestation: "none"
    };

    // Create the credential
    const credential = await navigator.credentials.create({
      publicKey: publicKeyCredentialCreationOptions
    }) as PublicKeyCredential;

    if (!credential) {
      return null;
    }

    // Extract credential ID and public key
    const credentialId = arrayBufferToBase64(credential.rawId);
    const response = credential.response as AuthenticatorAttestationResponse;
    const publicKeyBuffer = response.getPublicKey();
    const publicKey = publicKeyBuffer ? arrayBufferToBase64(publicKeyBuffer) : '';

    return {
      credentialId,
      publicKey
    };
  } catch (error: any) {
    // User cancelled or error occurred
    if (error.name === 'NotAllowedError') {
      console.log('User cancelled passkey registration');
    } else {
      console.error('Passkey registration error:', error);
    }
    return null;
  }
}

/**
 * Authenticate using an existing passkey
 */
export async function authenticateWithPasskey(
  credentialId: string
): Promise<boolean> {
  try {
    // Generate a random challenge
    const challenge = new Uint8Array(32);
    crypto.getRandomValues(challenge);

    // Convert credential ID from base64 to ArrayBuffer
    const credentialIdBuffer = base64ToArrayBuffer(credentialId);

    // Create authentication options
    const publicKeyCredentialRequestOptions: PublicKeyCredentialRequestOptions = {
      challenge: challenge,
      allowCredentials: [{
        id: credentialIdBuffer,
        type: 'public-key',
        transports: ['internal'], // Platform authenticator
      }],
      timeout: 60000,
      userVerification: "required"
    };

    // Request authentication
    const credential = await navigator.credentials.get({
      publicKey: publicKeyCredentialRequestOptions
    }) as PublicKeyCredential;

    // If we get here, authentication was successful
    return !!credential;
  } catch (error: any) {
    // User cancelled or authentication failed
    if (error.name === 'NotAllowedError') {
      console.log('User cancelled passkey authentication');
    } else {
      console.error('Passkey authentication error:', error);
    }
    return false;
  }
}

/**
 * Convert ArrayBuffer to Base64 string
 */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Convert Base64 string to ArrayBuffer
 */
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}
