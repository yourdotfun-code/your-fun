import { PublicKey } from "@solana/web3.js";

const PROGRAM_ID = new PublicKey(
    "YRFunHP2kVerify1111111111111111111111111111"
);

export const SEEDS = {
    REGISTRY: Buffer.from("registry"),
    HUMAN: Buffer.from("human"),
    SESSION: Buffer.from("session"),
    INTERACTION: Buffer.from("interaction"),
} as const;

/**
 * Derives the PlatformRegistry PDA.
 */
export function deriveRegistryAddress(programId: PublicKey = PROGRAM_ID): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
        [SEEDS.REGISTRY],
        programId
    );
}

/**
 * Derives the HumanRecord PDA for a given wallet.
 */
export function deriveHumanRecordAddress(
    wallet: PublicKey,
    programId: PublicKey = PROGRAM_ID
): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
        [SEEDS.HUMAN, wallet.toBuffer()],
        programId
    );
}

/**
 * Derives the SessionAccount PDA for a given human record and session index.
 */
export function deriveSessionAddress(
    humanRecord: PublicKey,
    sessionIndex: bigint | number,
    programId: PublicKey = PROGRAM_ID
): [PublicKey, number] {
    const indexBuffer = Buffer.alloc(8);
    indexBuffer.writeBigUInt64LE(BigInt(sessionIndex));
    return PublicKey.findProgramAddressSync(
        [SEEDS.SESSION, humanRecord.toBuffer(), indexBuffer],
        programId
    );
}

/**
 * Derives the InteractionLog PDA for a given session and interaction index.
 */
export function deriveInteractionAddress(
    session: PublicKey,
    interactionIndex: number,
    programId: PublicKey = PROGRAM_ID
): [PublicKey, number] {
    const indexBuffer = Buffer.alloc(4);
    indexBuffer.writeUInt32LE(interactionIndex);
    return PublicKey.findProgramAddressSync(
        [SEEDS.INTERACTION, session.toBuffer(), indexBuffer],
        programId
    );
}
