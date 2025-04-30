import * as anchor from "@coral-xyz/anchor";
import { Connection, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import BN from "bn.js";
import {
    deriveRegistryAddress,
    deriveHumanRecordAddress,
    deriveSessionAddress,
    deriveInteractionAddress,
} from "./pda";
import {
    PlatformRegistry,
    HumanRecord,
    SessionAccount,
    InteractionLog,
    YourFunConfig,
    RegisterHumanParams,
    VerifyHumanParams,
    CreateSessionParams,
    RecordInteractionParams,
} from "./types";

const DEFAULT_PROGRAM_ID = new PublicKey(
    "YRFunHP2kVerify1111111111111111111111111111"
);

/**
 * YourFunClient provides a high-level interface for interacting with
 * the your.fun Proof-of-Human protocol on Solana.
 *
 * Usage:
 *   const client = new YourFunClient(connection, wallet);
 *   await client.registerHuman({ challengeNonce, fingerprintHash });
 */
export class YourFunClient {
    readonly connection: Connection;
    readonly wallet: anchor.Wallet;
    readonly provider: anchor.AnchorProvider;
    readonly programId: PublicKey;

    private registryAddress: PublicKey | null = null;
    private registryBump: number | null = null;

    constructor(
        connection: Connection,
        wallet: anchor.Wallet,
        config?: Partial<YourFunConfig>
    ) {
        this.connection = connection;
        this.wallet = wallet;
        this.programId = config?.programId ?? DEFAULT_PROGRAM_ID;
        this.provider = new anchor.AnchorProvider(
            connection,
            wallet,
            { commitment: config?.commitment ?? "confirmed" }
        );
    }

    /**
     * Returns the PlatformRegistry PDA address, caching the result.
     */
    getRegistryAddress(): PublicKey {
        if (!this.registryAddress) {
            const [addr, bump] = deriveRegistryAddress(this.programId);
            this.registryAddress = addr;
            this.registryBump = bump;
        }
        return this.registryAddress;
    }

    /**
     * Returns the HumanRecord PDA for the connected wallet.
     */
    getHumanRecordAddress(wallet?: PublicKey): PublicKey {
        const target = wallet ?? this.wallet.publicKey;
        const [addr] = deriveHumanRecordAddress(target, this.programId);
        return addr;
    }

    /**
     * Initializes the platform registry. Can only be called once by the authority.
     */
    async initialize(
        verificationFeeLamports: number,
        minBehavioralScore: number,
        maxSessionDuration: number,
        maxInteractionsPerSession: number
    ): Promise<string> {
        const registryAddress = this.getRegistryAddress();

        const data = this.encodeInstruction("initialize", [
            new BN(verificationFeeLamports),
            minBehavioralScore,
            new BN(maxSessionDuration),
            maxInteractionsPerSession,
        ]);

        const ix = {
            programId: this.programId,
            keys: [
                { pubkey: registryAddress, isSigner: false, isWritable: true },
                { pubkey: this.wallet.publicKey, isSigner: true, isWritable: true },
                { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
            ],
            data,
        };

        const tx = new Transaction().add(ix);
        return await this.provider.sendAndConfirm(tx);
    }

    /**
     * Registers the connected wallet for Proof-of-Human verification.
     * This creates the HumanRecord PDA and pays the registration fee.
     */
    async registerHuman(params: RegisterHumanParams): Promise<string> {
        const registryAddress = this.getRegistryAddress();
        const humanRecordAddress = this.getHumanRecordAddress();

        if (params.challengeNonce.length !== 32) {
            throw new Error("Challenge nonce must be exactly 32 bytes");
        }
        if (params.fingerprintHash.length !== 32) {
            throw new Error("Fingerprint hash must be exactly 32 bytes");
        }

        const registry = await this.fetchRegistry();
        const data = this.encodeInstruction("register_human", [
            Array.from(params.challengeNonce),
            Array.from(params.fingerprintHash),
        ]);

        const ix = {
            programId: this.programId,
            keys: [
                { pubkey: registryAddress, isSigner: false, isWritable: true },
                { pubkey: humanRecordAddress, isSigner: false, isWritable: true },
                { pubkey: this.wallet.publicKey, isSigner: true, isWritable: true },
                { pubkey: registry.authority, isSigner: false, isWritable: true },
                { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
            ],
            data,
        };

        const tx = new Transaction().add(ix);
        return await this.provider.sendAndConfirm(tx);
    }

    /**
     * Creates an AI companion session under the verified human record.
     */
    async createSession(params: CreateSessionParams): Promise<{
        signature: string;
        sessionAddress: PublicKey;
        sessionIndex: number;
    }> {
        const registryAddress = this.getRegistryAddress();
        const humanRecordAddress = this.getHumanRecordAddress();
        const humanRecord = await this.fetchHumanRecord();
        const sessionIndex = humanRecord.sessionCount.toNumber();

        const [sessionAddress] = deriveSessionAddress(
            humanRecordAddress,
            sessionIndex,
            this.programId
        );

        if (params.initialTopic.length !== 32) {
            throw new Error("Initial topic must be exactly 32 bytes");
        }

        const data = this.encodeInstruction("create_session", [
            params.personalityId,
            Array.from(params.initialTopic),
        ]);

        const ix = {
            programId: this.programId,
            keys: [
                { pubkey: registryAddress, isSigner: false, isWritable: true },
                { pubkey: humanRecordAddress, isSigner: false, isWritable: true },
                { pubkey: sessionAddress, isSigner: false, isWritable: true },
                { pubkey: this.wallet.publicKey, isSigner: true, isWritable: true },
                { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
            ],
            data,
        };

        const tx = new Transaction().add(ix);
        const signature = await this.provider.sendAndConfirm(tx);

        return { signature, sessionAddress, sessionIndex };
    }

    /**
     * Records a learning interaction within an active session.
     */
    async recordInteraction(params: RecordInteractionParams): Promise<string> {
        const registryAddress = this.getRegistryAddress();
        const humanRecordAddress = this.getHumanRecordAddress();

        const [interactionAddress] = deriveInteractionAddress(
            params.sessionAddress,
            params.sessionIndex,
            this.programId
        );

        if (params.contentHash.length !== 32) {
            throw new Error("Content hash must be exactly 32 bytes");
        }

        const data = this.encodeInstruction("record_interaction", [
            Array.from(params.contentHash),
            params.interactionType,
            params.score,
            params.durationSeconds,
        ]);

        const ix = {
            programId: this.programId,
            keys: [
                { pubkey: registryAddress, isSigner: false, isWritable: true },
                { pubkey: humanRecordAddress, isSigner: false, isWritable: true },
                { pubkey: params.sessionAddress, isSigner: false, isWritable: true },
                { pubkey: interactionAddress, isSigner: false, isWritable: true },
                { pubkey: this.wallet.publicKey, isSigner: true, isWritable: true },
                { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
            ],
            data,
        };

        const tx = new Transaction().add(ix);
        return await this.provider.sendAndConfirm(tx);
    }

    /**
     * Fetches the current PlatformRegistry state from the chain.
     */
    async fetchRegistry(): Promise<PlatformRegistry> {
        const address = this.getRegistryAddress();
        const info = await this.connection.getAccountInfo(address);
        if (!info) {
            throw new Error("Platform registry not found. Has it been initialized?");
        }
        return this.deserializeRegistry(info.data);
    }

    /**
     * Fetches the HumanRecord for the connected wallet.
     */
    async fetchHumanRecord(wallet?: PublicKey): Promise<HumanRecord> {
        const address = this.getHumanRecordAddress(wallet);
        const info = await this.connection.getAccountInfo(address);
        if (!info) {
            throw new Error("Human record not found. Has this wallet been registered?");
        }
        return this.deserializeHumanRecord(info.data);
    }

    /**
     * Fetches a SessionAccount by address.
     */
    async fetchSession(sessionAddress: PublicKey): Promise<SessionAccount> {
        const info = await this.connection.getAccountInfo(sessionAddress);
        if (!info) {
            throw new Error("Session not found at the provided address");
        }
        return this.deserializeSession(info.data);
    }

    /**
     * Fetches an InteractionLog by address.
     */
    async fetchInteraction(interactionAddress: PublicKey): Promise<InteractionLog> {
        const info = await this.connection.getAccountInfo(interactionAddress);
        if (!info) {
            throw new Error("Interaction not found at the provided address");
        }
        return this.deserializeInteraction(info.data);
    }

    /**
     * Checks whether the connected wallet has been verified as human.
     */
    async isVerifiedHuman(wallet?: PublicKey): Promise<boolean> {
        try {
            const record = await this.fetchHumanRecord(wallet);
            return record.isActive;
        } catch {
            return false;
        }
    }

    // -- Serialization helpers --

    private encodeInstruction(name: string, args: unknown[]): Buffer {
        const discriminator = this.computeDiscriminator(name);
        const argsBuffer = this.serializeArgs(args);
        return Buffer.concat([discriminator, argsBuffer]);
    }

    private computeDiscriminator(name: string): Buffer {
        const crypto = require("crypto");
        const hash = crypto.createHash("sha256")
            .update(`global:${name}`)
            .digest();
        return hash.slice(0, 8);
    }

    private serializeArgs(args: unknown[]): Buffer {
        const buffers: Buffer[] = [];
        for (const arg of args) {
            if (arg instanceof BN) {
                const buf = Buffer.alloc(8);
                buf.writeBigInt64LE(BigInt(arg.toString()));
                buffers.push(buf);
            } else if (typeof arg === "number") {
                if (Number.isInteger(arg) && arg >= 0 && arg <= 255) {
                    buffers.push(Buffer.from([arg]));
                } else {
                    const buf = Buffer.alloc(4);
                    buf.writeUInt32LE(arg);
                    buffers.push(buf);
                }
            } else if (Array.isArray(arg)) {
                buffers.push(Buffer.from(arg as number[]));
            }
        }
        return Buffer.concat(buffers);
    }

    private deserializeRegistry(data: Buffer): PlatformRegistry {
        let offset = 8;
        const authority = new PublicKey(data.slice(offset, offset + 32)); offset += 32;
        const verificationFeeLamports = new BN(data.slice(offset, offset + 8), "le"); offset += 8;
        const totalVerifiedHumans = new BN(data.slice(offset, offset + 8), "le"); offset += 8;
        const totalSessionsCreated = new BN(data.slice(offset, offset + 8), "le"); offset += 8;
        const totalInteractions = new BN(data.slice(offset, offset + 8), "le"); offset += 8;
        const isPaused = data[offset] === 1; offset += 1;
        const minBehavioralScore = data[offset]; offset += 1;
        const maxSessionDuration = new BN(data.slice(offset, offset + 8), "le"); offset += 8;
        const maxInteractionsPerSession = data.readUInt32LE(offset); offset += 4;
        const bump = data[offset];

        return {
            authority,
            verificationFeeLamports,
            totalVerifiedHumans,
            totalSessionsCreated,
            totalInteractions,
            isPaused,
            minBehavioralScore,
            maxSessionDuration,
            maxInteractionsPerSession,
            bump,
        };
    }

    private deserializeHumanRecord(data: Buffer): HumanRecord {
        let offset = 8;
        const wallet = new PublicKey(data.slice(offset, offset + 32)); offset += 32;
        const verifiedBy = new PublicKey(data.slice(offset, offset + 32)); offset += 32;
        const verifiedAt = new BN(data.slice(offset, offset + 8), "le"); offset += 8;
        const verificationLevel = data[offset]; offset += 1;
        const fingerprintHash = new Uint8Array(data.slice(offset, offset + 32)); offset += 32;
        const isActive = data[offset] === 1; offset += 1;
        const sessionCount = new BN(data.slice(offset, offset + 8), "le"); offset += 8;
        const totalInteractions = new BN(data.slice(offset, offset + 8), "le"); offset += 8;
        const lastActiveAt = new BN(data.slice(offset, offset + 8), "le"); offset += 8;
        const learningScore = new BN(data.slice(offset, offset + 8), "le"); offset += 8;
        const challengeNonce = new Uint8Array(data.slice(offset, offset + 32)); offset += 32;
        const bump = data[offset];

        return {
            wallet,
            verifiedBy,
            verifiedAt,
            verificationLevel,
            fingerprintHash,
            isActive,
            sessionCount,
            totalInteractions,
            lastActiveAt,
            learningScore,
            challengeNonce,
            bump,
        };
    }

    private deserializeSession(data: Buffer): SessionAccount {
        let offset = 8;
        const humanRecord = new PublicKey(data.slice(offset, offset + 32)); offset += 32;
        const owner = new PublicKey(data.slice(offset, offset + 32)); offset += 32;
        const sessionIndex = new BN(data.slice(offset, offset + 8), "le"); offset += 8;
        const createdAt = new BN(data.slice(offset, offset + 8), "le"); offset += 8;
        const lastInteractionAt = new BN(data.slice(offset, offset + 8), "le"); offset += 8;
        const expiresAt = new BN(data.slice(offset, offset + 8), "le"); offset += 8;
        const isActive = data[offset] === 1; offset += 1;
        const interactionCount = data.readUInt32LE(offset); offset += 4;
        const personalityId = data[offset]; offset += 1;
        const currentTopic = new Uint8Array(data.slice(offset, offset + 32)); offset += 32;
        const sessionScore = new BN(data.slice(offset, offset + 8), "le"); offset += 8;
        const bump = data[offset];

        return {
            humanRecord,
            owner,
            sessionIndex,
            createdAt,
            lastInteractionAt,
            expiresAt,
            isActive,
            interactionCount,
            personalityId,
            currentTopic,
            sessionScore,
            bump,
        };
    }

    private deserializeInteraction(data: Buffer): InteractionLog {
        let offset = 8;
        const session = new PublicKey(data.slice(offset, offset + 32)); offset += 32;
        const user = new PublicKey(data.slice(offset, offset + 32)); offset += 32;
        const interactionIndex = data.readUInt32LE(offset); offset += 4;
        const timestamp = new BN(data.slice(offset, offset + 8), "le"); offset += 8;
        const contentHash = new Uint8Array(data.slice(offset, offset + 32)); offset += 32;
        const interactionType = data[offset]; offset += 1;
        const score = data[offset]; offset += 1;
        const durationSeconds = data.readUInt32LE(offset); offset += 4;
        const bump = data[offset];

        return {
            session,
            user,
            interactionIndex,
            timestamp,
            contentHash,
            interactionType,
            score,
            durationSeconds,
            bump,
        };
    }
}
