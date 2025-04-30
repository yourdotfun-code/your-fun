import { Connection, PublicKey, Transaction, SystemProgram } from "@solana/web3.js";
import { createHash } from "crypto";

const PROGRAM_ID = new PublicKey(
    "YRFunHP2kVerify1111111111111111111111111111"
);

const SEEDS = {
    REGISTRY: Buffer.from("registry"),
    HUMAN: Buffer.from("human"),
    SESSION: Buffer.from("session"),
    INTERACTION: Buffer.from("interaction"),
};

/**
 * Solana interaction service for the your.fun API.
 * Handles transaction preparation, account lookups, and on-chain state queries.
 */
export class SolanaService {
    private connection: Connection;
    private programId: PublicKey;

    constructor() {
        const rpcUrl = process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
        this.connection = new Connection(rpcUrl, "confirmed");
        this.programId = PROGRAM_ID;
    }

    /**
     * Prepares a registration transaction for Proof-of-Human verification.
     * Returns a serialized transaction that the client can sign and submit.
     */
    async prepareRegistrationTransaction(
        walletAddress: string,
        challengeNonce: number[],
        fingerprintHash: number[]
    ): Promise<{ transaction: string; registryAddress: string; humanRecordAddress: string }> {
        const wallet = new PublicKey(walletAddress);
        const [registryAddress] = this.deriveRegistryAddress();
        const [humanRecordAddress] = this.deriveHumanRecordAddress(wallet);

        const registryInfo = await this.connection.getAccountInfo(registryAddress);
        if (!registryInfo) {
            throw new Error("Platform registry has not been initialized");
        }

        const authorityOffset = 8;
        const authority = new PublicKey(
            registryInfo.data.slice(authorityOffset, authorityOffset + 32)
        );

        const discriminator = this.computeDiscriminator("register_human");
        const instructionData = Buffer.concat([
            discriminator,
            Buffer.from(challengeNonce),
            Buffer.from(fingerprintHash),
        ]);

        const ix = {
            programId: this.programId,
            keys: [
                { pubkey: registryAddress, isSigner: false, isWritable: true },
                { pubkey: humanRecordAddress, isSigner: false, isWritable: true },
                { pubkey: wallet, isSigner: true, isWritable: true },
                { pubkey: authority, isSigner: false, isWritable: true },
                { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
            ],
            data: instructionData,
        };

        const tx = new Transaction().add(ix);
        const { blockhash } = await this.connection.getLatestBlockhash();
        tx.recentBlockhash = blockhash;
        tx.feePayer = wallet;

        const serializedTx = tx.serialize({
            requireAllSignatures: false,
            verifySignatures: false,
        });

        return {
            transaction: serializedTx.toString("base64"),
            registryAddress: registryAddress.toBase58(),
            humanRecordAddress: humanRecordAddress.toBase58(),
        };
    }

    /**
     * Queries the verification status of a wallet address.
     */
    async getVerificationStatus(walletAddress: string): Promise<{
        isRegistered: boolean;
        isVerified: boolean;
        verificationLevel: number;
        verifiedAt: number | null;
        sessionCount: number;
        totalInteractions: number;
        learningScore: number;
    }> {
        const wallet = new PublicKey(walletAddress);
        const [humanRecordAddress] = this.deriveHumanRecordAddress(wallet);

        const accountInfo = await this.connection.getAccountInfo(humanRecordAddress);

        if (!accountInfo) {
            return {
                isRegistered: false,
                isVerified: false,
                verificationLevel: 0,
                verifiedAt: null,
                sessionCount: 0,
                totalInteractions: 0,
                learningScore: 0,
            };
        }

        const data = accountInfo.data;
        let offset = 8;

        offset += 32;
        offset += 32;

        const verifiedAtBuf = data.slice(offset, offset + 8);
        const verifiedAt = Number(verifiedAtBuf.readBigInt64LE(0));
        offset += 8;

        const verificationLevel = data[offset];
        offset += 1;

        offset += 32;

        const isActive = data[offset] === 1;
        offset += 1;

        const sessionCountBuf = data.slice(offset, offset + 8);
        const sessionCount = Number(sessionCountBuf.readBigInt64LE(0));
        offset += 8;

        const totalInteractionsBuf = data.slice(offset, offset + 8);
        const totalInteractions = Number(totalInteractionsBuf.readBigInt64LE(0));
        offset += 8;

        offset += 8;

        const learningScoreBuf = data.slice(offset, offset + 8);
        const learningScore = Number(learningScoreBuf.readBigInt64LE(0));

        return {
            isRegistered: true,
            isVerified: isActive,
            verificationLevel,
            verifiedAt: verifiedAt > 0 ? verifiedAt : null,
            sessionCount,
            totalInteractions,
            learningScore,
        };
    }

    /**
     * Fetches the platform registry global statistics.
     */
    async getPlatformStats(): Promise<{
        totalVerifiedHumans: number;
        totalSessionsCreated: number;
        totalInteractions: number;
        isPaused: boolean;
    }> {
        const [registryAddress] = this.deriveRegistryAddress();
        const accountInfo = await this.connection.getAccountInfo(registryAddress);

        if (!accountInfo) {
            throw new Error("Platform registry not found");
        }

        const data = accountInfo.data;
        let offset = 8 + 32 + 8;

        const totalVerifiedHumansBuf = data.slice(offset, offset + 8);
        const totalVerifiedHumans = Number(totalVerifiedHumansBuf.readBigInt64LE(0));
        offset += 8;

        const totalSessionsBuf = data.slice(offset, offset + 8);
        const totalSessionsCreated = Number(totalSessionsBuf.readBigInt64LE(0));
        offset += 8;

        const totalInteractionsBuf = data.slice(offset, offset + 8);
        const totalInteractions = Number(totalInteractionsBuf.readBigInt64LE(0));
        offset += 8;

        const isPaused = data[offset] === 1;

        return {
            totalVerifiedHumans,
            totalSessionsCreated,
            totalInteractions,
            isPaused,
        };
    }

    /**
     * Prepares a session creation transaction.
     */
    async prepareSessionTransaction(
        walletAddress: string,
        personalityId: number,
        initialTopic: number[]
    ): Promise<{ transaction: string; sessionAddress: string }> {
        const wallet = new PublicKey(walletAddress);
        const [registryAddress] = this.deriveRegistryAddress();
        const [humanRecordAddress] = this.deriveHumanRecordAddress(wallet);

        const humanInfo = await this.connection.getAccountInfo(humanRecordAddress);
        if (!humanInfo) {
            throw new Error("Human record not found");
        }

        const sessionCountOffset = 8 + 32 + 32 + 8 + 1 + 32 + 1;
        const sessionCountBuf = humanInfo.data.slice(
            sessionCountOffset,
            sessionCountOffset + 8
        );
        const sessionIndex = Number(sessionCountBuf.readBigInt64LE(0));

        const indexBuffer = Buffer.alloc(8);
        indexBuffer.writeBigUInt64LE(BigInt(sessionIndex));

        const [sessionAddress] = PublicKey.findProgramAddressSync(
            [SEEDS.SESSION, humanRecordAddress.toBuffer(), indexBuffer],
            this.programId
        );

        const discriminator = this.computeDiscriminator("create_session");
        const instructionData = Buffer.concat([
            discriminator,
            Buffer.from([personalityId]),
            Buffer.from(initialTopic),
        ]);

        const ix = {
            programId: this.programId,
            keys: [
                { pubkey: registryAddress, isSigner: false, isWritable: true },
                { pubkey: humanRecordAddress, isSigner: false, isWritable: true },
                { pubkey: sessionAddress, isSigner: false, isWritable: true },
                { pubkey: wallet, isSigner: true, isWritable: true },
                { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
            ],
            data: instructionData,
        };

        const tx = new Transaction().add(ix);
        const { blockhash } = await this.connection.getLatestBlockhash();
        tx.recentBlockhash = blockhash;
        tx.feePayer = wallet;

        const serializedTx = tx.serialize({
            requireAllSignatures: false,
            verifySignatures: false,
        });

        return {
            transaction: serializedTx.toString("base64"),
            sessionAddress: sessionAddress.toBase58(),
        };
    }

    // -- PDA derivation --

    private deriveRegistryAddress(): [PublicKey, number] {
        return PublicKey.findProgramAddressSync(
            [SEEDS.REGISTRY],
            this.programId
        );
    }

    private deriveHumanRecordAddress(wallet: PublicKey): [PublicKey, number] {
        return PublicKey.findProgramAddressSync(
            [SEEDS.HUMAN, wallet.toBuffer()],
            this.programId
        );
    }

    private computeDiscriminator(name: string): Buffer {
        const hash = createHash("sha256")
            .update(`global:${name}`)
            .digest();
        return hash.slice(0, 8);
    }
}
