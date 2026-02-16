/**
 * Cryptographic Infrastructure for Open Badges 3.0
 * Handles key generation, signing, and verification using Ed25519
 */

import { ed25519 } from '@noble/curves/ed25519';
import { bytesToHex, hexToBytes } from '@noble/curves/abstract/utils';
import crypto from 'crypto';

// =====================================================
// Types
// =====================================================

export interface KeyPair {
    publicKey: string;  // Hex-encoded
    privateKey: string; // Hex-encoded
    publicKeyMultibase: string;
    publicKeyJwk: JsonWebKey;
}

export interface SignatureProof {
    type: string;
    created: string;
    verificationMethod: string;
    proofPurpose: string;
    proofValue: string;
}

export interface JsonWebKey {
    kty: string;
    crv: string;
    x: string;
}

// =====================================================
// Key Generation
// =====================================================

/**
 * Generate Ed25519 key pair for signing Open Badges credentials
 */
export function generateIssuerKeyPair(): KeyPair {
    // Generate random private key
    const privateKeyBytes = ed25519.utils.randomPrivateKey();

    // Derive public key
    const publicKeyBytes = ed25519.getPublicKey(privateKeyBytes);

    // Convert to hex
    const privateKey = bytesToHex(privateKeyBytes);
    const publicKey = bytesToHex(publicKeyBytes);

    // Generate multibase encoding (base58btc)
    const publicKeyMultibase = 'z' + base58Encode(publicKeyBytes);

    // Generate JWK format
    const publicKeyJwk: JsonWebKey = {
        kty: 'OKP',
        crv: 'Ed25519',
        x: Buffer.from(publicKeyBytes).toString('base64url'),
    };

    return {
        publicKey,
        privateKey,
        publicKeyMultibase,
        publicKeyJwk,
    };
}

// =====================================================
// Signing
// =====================================================

/**
 * Sign a credential with Ed25519 private key
 * Returns Ed25519Signature2020 proof
 */
export function signCredential(
    credential: any,
    privateKeyHex: string,
    verificationMethod: string
): SignatureProof {
    // Create canonical JSON (sorted keys, no whitespace)
    const canonicalJson = canonicalize(credential);

    // Hash the canonical JSON
    const messageHash = crypto.createHash('sha256').update(canonicalJson).digest();

    // Sign the hash
    const privateKeyBytes = hexToBytes(privateKeyHex);
    const signatureBytes = ed25519.sign(messageHash, privateKeyBytes);

    // Encode signature as multibase
    const proofValue = 'z' + base58Encode(signatureBytes);

    // Create proof object
    const proof: SignatureProof = {
        type: 'Ed25519Signature2020',
        created: new Date().toISOString(),
        verificationMethod,
        proofPurpose: 'assertionMethod',
        proofValue,
    };

    return proof;
}

/**
 * Add cryptographic proof to credential
 */
export function addProofToCredential(
    credential: any,
    privateKeyHex: string,
    verificationMethod: string
): any {
    const proof = signCredential(credential, privateKeyHex, verificationMethod);

    return {
        ...credential,
        proof,
    };
}

// =====================================================
// Verification
// =====================================================

/**
 * Verify Ed25519 signature on a credential
 */
export function verifyCredential(
    credential: any,
    publicKeyHex: string
): boolean {
    try {
        const { proof, ...credentialWithoutProof } = credential;

        if (!proof || proof.type !== 'Ed25519Signature2020') {
            return false;
        }

        // Create canonical JSON
        const canonicalJson = canonicalize(credentialWithoutProof);

        // Hash the canonical JSON
        const messageHash = crypto.createHash('sha256').update(canonicalJson).digest();

        // Decode signature from multibase
        const signatureBytes = base58Decode(proof.proofValue.slice(1)); // Remove 'z' prefix

        // Verify signature
        const publicKeyBytes = hexToBytes(publicKeyHex);
        const isValid = ed25519.verify(signatureBytes, messageHash, publicKeyBytes);

        return isValid;
    } catch (error) {
        console.error('Verification error:', error);
        return false;
    }
}

// =====================================================
// Encryption (for storing private keys)
// =====================================================

/**
 * Encrypt private key using AES-256-GCM
 */
export function encryptPrivateKey(
    privateKeyHex: string,
    encryptionKey: string
): string {
    const algorithm = 'aes-256-gcm';
    const iv = crypto.randomBytes(16);
    const key = crypto.createHash('sha256').update(encryptionKey).digest();

    const cipher = crypto.createCipheriv(algorithm, key, iv);

    let encrypted = cipher.update(privateKeyHex, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag();

    // Return: iv:authTag:encrypted
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

/**
 * Decrypt private key using AES-256-GCM
 */
export function decryptPrivateKey(
    encryptedData: string,
    encryptionKey: string
): string {
    const algorithm = 'aes-256-gcm';
    const [ivHex, authTagHex, encrypted] = encryptedData.split(':');

    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const key = crypto.createHash('sha256').update(encryptionKey).digest();

    const decipher = crypto.createDecipheriv(algorithm, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
}

// =====================================================
// Utility Functions
// =====================================================

/**
 * Canonicalize JSON (RFC 8785)
 * Sorts keys and removes whitespace
 */
function canonicalize(obj: any): string {
    if (obj === null) return 'null';
    if (typeof obj !== 'object') return JSON.stringify(obj);
    if (Array.isArray(obj)) {
        return '[' + obj.map(canonicalize).join(',') + ']';
    }

    const keys = Object.keys(obj).sort();
    const pairs = keys.map(key => `"${key}":${canonicalize(obj[key])}`);
    return '{' + pairs.join(',') + '}';
}

/**
 * Base58 encoding (Bitcoin alphabet)
 */
const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function base58Encode(bytes: Uint8Array): string {
    let num = BigInt('0x' + bytesToHex(bytes));
    let result = '';

    const ZERO = BigInt(0);
    const FIFTY_EIGHT = BigInt(58);
    while (num > ZERO) {
        const remainder = Number(num % FIFTY_EIGHT);
        result = BASE58_ALPHABET[remainder] + result;
        num = num / FIFTY_EIGHT;
    }

    // Add leading '1's for leading zero bytes
    for (let i = 0; i < bytes.length && bytes[i] === 0; i++) {
        result = '1' + result;
    }

    return result;
}

function base58Decode(str: string): Uint8Array {
    const FIFTY_EIGHT = BigInt(58);
    let num = BigInt(0);

    for (let i = 0; i < str.length; i++) {
        const char = str[i];
        const value = BASE58_ALPHABET.indexOf(char);
        if (value === -1) {
            throw new Error(`Invalid base58 character: ${char}`);
        }
        num = num * FIFTY_EIGHT + BigInt(value);
    }

    const hex = num.toString(16).padStart(64, '0');
    return hexToBytes(hex);
}

/**
 * Get encryption key from environment
 */
export function getEncryptionKey(): string {
    const key = process.env.CERTIFICATE_ENCRYPTION_KEY;
    if (!key) {
        throw new Error('CERTIFICATE_ENCRYPTION_KEY environment variable not set');
    }
    return key;
}
