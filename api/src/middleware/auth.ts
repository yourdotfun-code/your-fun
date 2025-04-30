import { Request, Response, NextFunction } from "express";
import { PublicKey } from "@solana/web3.js";
import nacl from "tweetnacl";
import bs58 from "bs58";

/**
 * Extended request type that carries the authenticated wallet address.
 */
export interface AuthenticatedRequest extends Request {
    wallet?: string;
    walletPublicKey?: PublicKey;
}

/**
 * Wallet signature authentication middleware.
 *
 * Expects an Authorization header in the format:
 *   Bearer <base58-wallet>.<base58-signature>.<timestamp>
 *
 * The signed message format is:
 *   "your.fun-auth:<timestamp>"
 *
 * Signatures are valid for 5 minutes from the timestamp.
 */
export function walletAuthMiddleware(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
): void {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        res.status(401).json({
            error: "authentication_required",
            message: "Authorization header with Bearer token is required",
        });
        return;
    }

    const token = authHeader.slice(7);
    const parts = token.split(".");

    if (parts.length !== 3) {
        res.status(401).json({
            error: "invalid_token_format",
            message: "Token must be in format: <wallet>.<signature>.<timestamp>",
        });
        return;
    }

    const [walletBase58, signatureBase58, timestampStr] = parts;
    const timestamp = parseInt(timestampStr, 10);

    if (isNaN(timestamp)) {
        res.status(401).json({
            error: "invalid_timestamp",
            message: "Token timestamp must be a valid integer",
        });
        return;
    }

    const now = Math.floor(Date.now() / 1000);
    const maxAge = 300;

    if (Math.abs(now - timestamp) > maxAge) {
        res.status(401).json({
            error: "token_expired",
            message: "Authentication token has expired. Generate a new signature.",
        });
        return;
    }

    let walletPublicKey: PublicKey;
    try {
        walletPublicKey = new PublicKey(walletBase58);
    } catch {
        res.status(401).json({
            error: "invalid_wallet",
            message: "The provided wallet address is not a valid Solana public key",
        });
        return;
    }

    const expectedMessage = `your.fun-auth:${timestamp}`;
    const messageBytes = new TextEncoder().encode(expectedMessage);

    let signatureBytes: Uint8Array;
    try {
        signatureBytes = bs58.decode(signatureBase58);
    } catch {
        res.status(401).json({
            error: "invalid_signature_encoding",
            message: "The signature must be encoded in base58",
        });
        return;
    }

    const isValid = nacl.sign.detached.verify(
        messageBytes,
        signatureBytes,
        walletPublicKey.toBytes()
    );

    if (!isValid) {
        res.status(401).json({
            error: "invalid_signature",
            message: "The signature does not match the wallet address",
        });
        return;
    }

    req.wallet = walletBase58;
    req.walletPublicKey = walletPublicKey;
    next();
}
