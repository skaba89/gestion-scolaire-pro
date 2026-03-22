/**
 * Two-Factor Authentication (2FA) Utilities
 * 
 * Provides functions for browser-compatible:
 * - TOTP (Time-based One-Time Password) generation and verification
 * - Backup code generation and verification
 * - Email code generation
 */

import * as OTPAuth from 'otpauth';

// Base32 encoding for TOTP secrets
const BASE32_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/**
 * Generate a random base32 secret for TOTP
 * @param length Length of the secret (default: 32 characters)
 * @returns Base32-encoded secret
 */
export function generateTOTPSecret(length: number = 32): string {
    const randomBuffer = new Uint8Array(length);
    window.crypto.getRandomValues(randomBuffer);

    let secret = '';
    for (let i = 0; i < length; i++) {
        secret += BASE32_CHARS[randomBuffer[i] % 32];
    }
    return secret;
}

/**
 * Generate backup/recovery codes
 * @param count Number of codes to generate (default: 10)
 * @returns Array of backup codes (format: XXXX-XXXX-XXXX)
 */
export function generateBackupCodes(count: number = 10): string[] {
    const codes: string[] = [];

    for (let i = 0; i < count; i++) {
        const randomBuffer = new Uint8Array(6);
        window.crypto.getRandomValues(randomBuffer);

        const code = Array.from(randomBuffer)
            .map(byte => byte.toString(16).padStart(2, '0'))
            .join('')
            .toUpperCase()
            .match(/.{1,4}/g)!
            .join('-');

        codes.push(code);
    }

    return codes;
}

/**
 * Hash a backup code for secure storage (Async using Web Crypto)
 * @param code Backup code to hash
 * @returns Hashed code (Promise)
 */
export async function hashBackupCode(code: string): Promise<string> {
    // Remove dashes and normalize
    const normalized = code.replace(/-/g, '').toUpperCase();

    const msgUint8 = new TextEncoder().encode(normalized);
    const hashBuffer = await window.crypto.subtle.digest('SHA-256', msgUint8);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Generate a random 6-digit code for email-based 2FA
 * @returns 6-digit code
 */
export function generateEmailCode(): string {
    const randomBuffer = new Uint32Array(1);
    window.crypto.getRandomValues(randomBuffer);
    const code = randomBuffer[0] % 1000000;
    return code.toString().padStart(6, '0');
}

/**
 * Generate a device fingerprint for trusted devices
 * @param userAgent User agent string
 * @param additionalData Additional data to include (e.g., screen resolution)
 * @returns Device fingerprint hash (Promise)
 */
export async function generateDeviceFingerprint(userAgent: string, additionalData?: Record<string, any>): Promise<string> {
    const data = {
        userAgent,
        ...additionalData,
    };

    const msgUint8 = new TextEncoder().encode(JSON.stringify(data));
    const hashBuffer = await window.crypto.subtle.digest('SHA-256', msgUint8);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * TOTP functionalities using otpauth (Works in browser)
 */
export function generateTOTPCode(secret: string): string {
    const totp = new OTPAuth.TOTP({
        secret: OTPAuth.Secret.fromBase32(secret),
        algorithm: 'SHA1',
        digits: 6,
        period: 30
    });
    return totp.generate();
}

export function verifyTOTPCode(secret: string, code: string): boolean {
    const totp = new OTPAuth.TOTP({
        secret: OTPAuth.Secret.fromBase32(secret),
        algorithm: 'SHA1',
        digits: 6,
        period: 30
    });
    const delta = totp.validate({ token: code, window: 1 });
    return delta !== null;
}
