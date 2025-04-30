import { PublicKey } from "@solana/web3.js";
import BN from "bn.js";

/**
 * On-chain PlatformRegistry state.
 */
export interface PlatformRegistry {
    authority: PublicKey;
    verificationFeeLamports: BN;
    totalVerifiedHumans: BN;
    totalSessionsCreated: BN;
    totalInteractions: BN;
    isPaused: boolean;
    minBehavioralScore: number;
    maxSessionDuration: BN;
    maxInteractionsPerSession: number;
    bump: number;
}

/**
 * On-chain HumanRecord state.
 */
export interface HumanRecord {
    wallet: PublicKey;
    verifiedBy: PublicKey;
    verifiedAt: BN;
    verificationLevel: number;
    fingerprintHash: Uint8Array;
    isActive: boolean;
    sessionCount: BN;
    totalInteractions: BN;
    lastActiveAt: BN;
    learningScore: BN;
    challengeNonce: Uint8Array;
    bump: number;
}

/**
 * On-chain SessionAccount state.
 */
export interface SessionAccount {
    humanRecord: PublicKey;
    owner: PublicKey;
    sessionIndex: BN;
    createdAt: BN;
    lastInteractionAt: BN;
    expiresAt: BN;
    isActive: boolean;
    interactionCount: number;
    personalityId: number;
    currentTopic: Uint8Array;
    sessionScore: BN;
    bump: number;
}

/**
 * On-chain InteractionLog state.
 */
export interface InteractionLog {
    session: PublicKey;
    user: PublicKey;
    interactionIndex: number;
    timestamp: BN;
    contentHash: Uint8Array;
    interactionType: number;
    score: number;
    durationSeconds: number;
    bump: number;
}

/**
 * Interaction type enum matching on-chain values.
 */
export enum InteractionType {
    Chat = 0,
    Quiz = 1,
    Exercise = 2,
    Review = 3,
}

/**
 * Companion personality archetypes.
 */
export enum PersonalityType {
    Mentor = 0,
    Explorer = 1,
    Challenger = 2,
    Collaborator = 3,
    Storyteller = 4,
}

/**
 * Client-side configuration for the SDK.
 */
export interface YourFunConfig {
    rpcEndpoint: string;
    programId?: PublicKey;
    commitment?: "processed" | "confirmed" | "finalized";
}

/**
 * Parameters for human registration.
 */
export interface RegisterHumanParams {
    challengeNonce: Uint8Array;
    fingerprintHash: Uint8Array;
}

/**
 * Parameters for human verification.
 */
export interface VerifyHumanParams {
    wallet: PublicKey;
    challengeResponse: Uint8Array;
    behavioralScore: number;
    verificationLevel: number;
}

/**
 * Parameters for session creation.
 */
export interface CreateSessionParams {
    personalityId: PersonalityType;
    initialTopic: Uint8Array;
}

/**
 * Parameters for recording an interaction.
 */
export interface RecordInteractionParams {
    sessionAddress: PublicKey;
    sessionIndex: number;
    contentHash: Uint8Array;
    interactionType: InteractionType;
    score: number;
    durationSeconds: number;
}

/**
 * AI chat message structure used in the companion interface.
 */
export interface ChatMessage {
    role: "user" | "assistant" | "system";
    content: string;
    timestamp: number;
}

/**
 * AI companion chat request payload.
 */
export interface ChatRequest {
    sessionId: string;
    message: string;
    personalityId: PersonalityType;
    context?: ChatMessage[];
}

/**
 * AI companion chat response payload.
 */
export interface ChatResponse {
    reply: string;
    contentHash: string;
    interactionType: InteractionType;
    suggestedScore: number;
    learningInsights: string[];
    nextTopicSuggestions: string[];
}

/**
 * Proof-of-Human challenge request.
 */
export interface ChallengeRequest {
    wallet: string;
    challengeType: "behavioral" | "cognitive" | "temporal";
}

/**
 * Proof-of-Human challenge response from the server.
 */
export interface ChallengeResponse {
    challengeId: string;
    challengeData: string;
    expiresAt: number;
    difficulty: number;
}

/**
 * Learning path progress tracker.
 */
export interface LearningProgress {
    topicId: string;
    topicName: string;
    completedLessons: number;
    totalLessons: number;
    currentScore: number;
    streak: number;
    lastActivityAt: number;
}
