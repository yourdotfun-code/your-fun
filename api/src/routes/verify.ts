import { Router, Request, Response } from "express";
import { createHash, randomBytes } from "crypto";
import { SolanaService } from "../services/solana";

export const verifyRouter = Router();
const solanaService = new SolanaService();

interface PendingChallenge {
    wallet: string;
    challengeData: string;
    challengeType: string;
    createdAt: number;
    expiresAt: number;
    difficulty: number;
    nonce: Buffer;
}

const pendingChallenges = new Map<string, PendingChallenge>();
const CHALLENGE_TTL_SECONDS = 300;

/**
 * POST /api/verify/challenge
 * Generates a new Proof-of-Human challenge for a wallet.
 */
verifyRouter.post("/challenge", (req: Request, res: Response) => {
    const { wallet, challengeType } = req.body;

    if (!wallet || !challengeType) {
        res.status(400).json({
            error: "missing_parameters",
            message: "wallet and challengeType are required",
        });
        return;
    }

    const validTypes = ["behavioral", "cognitive", "temporal"];
    if (!validTypes.includes(challengeType)) {
        res.status(400).json({
            error: "invalid_challenge_type",
            message: `challengeType must be one of: ${validTypes.join(", ")}`,
        });
        return;
    }

    const challengeId = createHash("sha256")
        .update(`${wallet}:${Date.now()}:${randomBytes(16).toString("hex")}`)
        .digest("hex")
        .slice(0, 32);

    const nonce = randomBytes(32);
    const difficulty = computeDifficulty(challengeType);
    const challengeData = generateChallengeData(challengeType, difficulty, nonce);
    const now = Math.floor(Date.now() / 1000);

    pendingChallenges.set(challengeId, {
        wallet,
        challengeData,
        challengeType,
        createdAt: now,
        expiresAt: now + CHALLENGE_TTL_SECONDS,
        difficulty,
        nonce,
    });

    res.json({
        challengeId,
        challengeData,
        challengeType,
        difficulty,
        expiresAt: now + CHALLENGE_TTL_SECONDS,
    });
});

/**
 * POST /api/verify/submit
 * Validates a challenge response and initiates on-chain verification.
 */
verifyRouter.post("/submit", async (req: Request, res: Response) => {
    const { challengeId, response, fingerprintData, wallet } = req.body;

    if (!challengeId || !response || !fingerprintData || !wallet) {
        res.status(400).json({
            error: "missing_parameters",
            message: "challengeId, response, fingerprintData, and wallet are required",
        });
        return;
    }

    const challenge = pendingChallenges.get(challengeId);
    if (!challenge) {
        res.status(404).json({
            error: "challenge_not_found",
            message: "The challenge has expired or does not exist",
        });
        return;
    }

    if (challenge.wallet !== wallet) {
        res.status(403).json({
            error: "wallet_mismatch",
            message: "This challenge was generated for a different wallet",
        });
        return;
    }

    const now = Math.floor(Date.now() / 1000);
    if (now > challenge.expiresAt) {
        pendingChallenges.delete(challengeId);
        res.status(410).json({
            error: "challenge_expired",
            message: "This challenge has expired. Request a new one.",
        });
        return;
    }

    const validationResult = validateChallengeResponse(
        challenge,
        response,
        fingerprintData
    );

    if (!validationResult.isValid) {
        res.status(400).json({
            error: "invalid_response",
            message: validationResult.reason,
            behavioralScore: validationResult.score,
        });
        return;
    }

    pendingChallenges.delete(challengeId);

    const fingerprintHash = createHash("sha256")
        .update(JSON.stringify(fingerprintData))
        .digest();

    const verificationLevel = determineVerificationLevel(
        validationResult.score,
        challenge.difficulty
    );

    try {
        const registrationResult = await solanaService.prepareRegistrationTransaction(
            wallet,
            Array.from(challenge.nonce),
            Array.from(fingerprintHash)
        );

        res.json({
            verified: true,
            behavioralScore: validationResult.score,
            verificationLevel,
            challengeNonce: Array.from(challenge.nonce),
            fingerprintHash: Array.from(fingerprintHash),
            transaction: registrationResult,
        });
    } catch (err) {
        const error = err as Error;
        res.status(500).json({
            error: "transaction_preparation_failed",
            message: error.message,
        });
    }
});

/**
 * GET /api/verify/status/:wallet
 * Checks the verification status of a wallet on-chain.
 */
verifyRouter.get("/status/:wallet", async (req: Request, res: Response) => {
    const { wallet } = req.params;

    try {
        const status = await solanaService.getVerificationStatus(wallet);
        res.json(status);
    } catch (err) {
        const error = err as Error;
        res.status(500).json({
            error: "status_check_failed",
            message: error.message,
        });
    }
});

function computeDifficulty(challengeType: string): number {
    const baseDifficulty: Record<string, number> = {
        behavioral: 5,
        cognitive: 7,
        temporal: 3,
    };
    const base = baseDifficulty[challengeType] ?? 5;
    const variance = Math.random() * 2 - 1;
    return Math.max(1, Math.min(10, Math.round(base + variance)));
}

function generateChallengeData(
    challengeType: string,
    difficulty: number,
    nonce: Buffer
): string {
    const seed = createHash("sha256")
        .update(Buffer.concat([nonce, Buffer.from(challengeType)]))
        .digest("hex");

    switch (challengeType) {
        case "behavioral":
            return JSON.stringify({
                type: "behavioral",
                requiredEvents: 50 + difficulty * 10,
                minSessionDuration: 5000 + difficulty * 1000,
                captureTypes: ["keystroke", "mouse", "scroll"],
                seed: seed.slice(0, 16),
            });

        case "cognitive":
            return JSON.stringify({
                type: "cognitive",
                puzzleComplexity: difficulty,
                timeLimit: 60000 - difficulty * 3000,
                seed: seed.slice(0, 16),
            });

        case "temporal":
            return JSON.stringify({
                type: "temporal",
                intervals: generateTemporalIntervals(difficulty, seed),
                tolerance: Math.max(50, 200 - difficulty * 15),
                seed: seed.slice(0, 16),
            });

        default:
            return JSON.stringify({ type: "unknown", seed: seed.slice(0, 16) });
    }
}

function generateTemporalIntervals(difficulty: number, seed: string): number[] {
    const count = 3 + difficulty;
    const intervals: number[] = [];
    let seedValue = parseInt(seed.slice(0, 8), 16);

    for (let i = 0; i < count; i++) {
        seedValue = (seedValue * 1103515245 + 12345) & 0x7fffffff;
        const interval = 500 + (seedValue % 2000);
        intervals.push(interval);
    }

    return intervals;
}

function validateChallengeResponse(
    challenge: PendingChallenge,
    response: Record<string, unknown>,
    fingerprintData: Record<string, unknown>
): { isValid: boolean; score: number; reason: string } {
    const timingScore = computeTimingScore(response);
    const entropyScore = computeEntropyScore(fingerprintData);
    const consistencyScore = computeConsistencyScore(response, challenge.challengeType);

    const weights = { timing: 0.3, entropy: 0.4, consistency: 0.3 };
    const totalScore = Math.round(
        timingScore * weights.timing +
        entropyScore * weights.entropy +
        consistencyScore * weights.consistency
    );

    const minScore = 40 + challenge.difficulty * 3;

    if (totalScore < minScore) {
        return {
            isValid: false,
            score: totalScore,
            reason: `Behavioral score ${totalScore} is below the minimum threshold of ${minScore}`,
        };
    }

    return { isValid: true, score: totalScore, reason: "passed" };
}

function computeTimingScore(response: Record<string, unknown>): number {
    const responseTimeMs = (response.responseTimeMs as number) ?? 0;

    if (responseTimeMs < 100) return 10;
    if (responseTimeMs < 500) return 40;
    if (responseTimeMs < 2000) return 80;
    if (responseTimeMs < 10000) return 95;
    return 60;
}

function computeEntropyScore(fingerprintData: Record<string, unknown>): number {
    const dataStr = JSON.stringify(fingerprintData);
    const charFreq = new Map<string, number>();

    for (const char of dataStr) {
        charFreq.set(char, (charFreq.get(char) ?? 0) + 1);
    }

    let entropy = 0;
    for (const count of charFreq.values()) {
        const p = count / dataStr.length;
        if (p > 0) entropy -= p * Math.log2(p);
    }

    return Math.min(100, Math.round(entropy * 20));
}

function computeConsistencyScore(
    response: Record<string, unknown>,
    challengeType: string
): number {
    const hasRequiredFields = response.responseTimeMs !== undefined;
    const baseScore = hasRequiredFields ? 60 : 20;

    const typeBonus: Record<string, number> = {
        behavioral: 20,
        cognitive: 25,
        temporal: 15,
    };

    return Math.min(100, baseScore + (typeBonus[challengeType] ?? 0));
}

function determineVerificationLevel(score: number, difficulty: number): number {
    const adjustedScore = score + difficulty * 2;

    if (adjustedScore >= 90) return 3;
    if (adjustedScore >= 70) return 2;
    return 1;
}
