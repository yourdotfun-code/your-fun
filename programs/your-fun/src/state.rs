use anchor_lang::prelude::*;

/// Global platform configuration and statistics.
/// Seeds: ["registry"]
#[account]
#[derive(Default)]
pub struct PlatformRegistry {
    /// The authority that can pause/unpause and update fees.
    pub authority: Pubkey,
    /// Base fee in lamports for human verification registration.
    pub verification_fee_lamports: u64,
    /// Total number of verified humans on the platform.
    pub total_verified_humans: u64,
    /// Total number of AI companion sessions created.
    pub total_sessions_created: u64,
    /// Total interactions recorded across all sessions.
    pub total_interactions: u64,
    /// Whether new registrations are paused.
    pub is_paused: bool,
    /// Minimum behavioral analysis score required for verification (0-100).
    pub min_behavioral_score: u8,
    /// Maximum session duration in seconds.
    pub max_session_duration: i64,
    /// Maximum interactions allowed per session.
    pub max_interactions_per_session: u32,
    /// Bump seed for PDA derivation.
    pub bump: u8,
    /// Reserved space for future upgrades.
    pub _reserved: [u8; 64],
}

impl PlatformRegistry {
    pub const SEED: &'static [u8] = b"registry";
    pub const SIZE: usize = 8 + 32 + 8 + 8 + 8 + 8 + 1 + 1 + 8 + 4 + 1 + 64;
}

/// A record of a verified human identity on the platform.
/// Seeds: ["human", wallet.key().as_ref()]
#[account]
pub struct HumanRecord {
    /// The wallet address of the verified human.
    pub wallet: Pubkey,
    /// The authority that performed the verification.
    pub verified_by: Pubkey,
    /// Unix timestamp of when the verification was completed.
    pub verified_at: i64,
    /// Verification level: 1=basic, 2=enhanced, 3=full.
    pub verification_level: u8,
    /// Hash of the behavioral fingerprint used during verification.
    pub fingerprint_hash: [u8; 32],
    /// Whether this human record is currently active.
    pub is_active: bool,
    /// Number of AI companion sessions this human has created.
    pub session_count: u64,
    /// Total interaction count across all sessions.
    pub total_interactions: u64,
    /// The last time this human was active (Unix timestamp).
    pub last_active_at: i64,
    /// Accumulated learning score based on interactions.
    pub learning_score: u64,
    /// Challenge nonce used during the verification process.
    pub challenge_nonce: [u8; 32],
    /// Bump seed for PDA derivation.
    pub bump: u8,
    /// Reserved space for future upgrades.
    pub _reserved: [u8; 32],
}

impl HumanRecord {
    pub const SEED: &'static [u8] = b"human";
    pub const SIZE: usize = 8 + 32 + 32 + 8 + 1 + 32 + 1 + 8 + 8 + 8 + 8 + 32 + 1 + 32;
}

/// An active AI companion session associated with a verified human.
/// Seeds: ["session", human_record.key().as_ref(), &session_index.to_le_bytes()]
#[account]
pub struct SessionAccount {
    /// Reference to the parent human record.
    pub human_record: Pubkey,
    /// The wallet of the session owner.
    pub owner: Pubkey,
    /// Unique session index for this human.
    pub session_index: u64,
    /// Unix timestamp of session creation.
    pub created_at: i64,
    /// Unix timestamp of the last interaction in this session.
    pub last_interaction_at: i64,
    /// Unix timestamp when this session expires.
    pub expires_at: i64,
    /// Whether this session is currently active.
    pub is_active: bool,
    /// Number of interactions recorded in this session.
    pub interaction_count: u32,
    /// Companion personality identifier (0-255 mapped to personality archetypes).
    pub personality_id: u8,
    /// Current learning topic identifier.
    pub current_topic: [u8; 32],
    /// Accumulated session score.
    pub session_score: u64,
    /// Bump seed for PDA derivation.
    pub bump: u8,
    /// Reserved space.
    pub _reserved: [u8; 16],
}

impl SessionAccount {
    pub const SEED: &'static [u8] = b"session";
    pub const SIZE: usize = 8 + 32 + 32 + 8 + 8 + 8 + 8 + 1 + 4 + 1 + 32 + 8 + 1 + 16;
}

/// A single recorded interaction within a session.
/// Seeds: ["interaction", session.key().as_ref(), &interaction_index.to_le_bytes()]
#[account]
pub struct InteractionLog {
    /// Reference to the parent session.
    pub session: Pubkey,
    /// The wallet that created this interaction.
    pub user: Pubkey,
    /// Index of this interaction within its session.
    pub interaction_index: u32,
    /// Unix timestamp of when the interaction occurred.
    pub timestamp: i64,
    /// SHA-256 hash of the interaction content (prompt + response).
    pub content_hash: [u8; 32],
    /// The type of interaction: 0=chat, 1=quiz, 2=exercise, 3=review.
    pub interaction_type: u8,
    /// Score awarded for this particular interaction (0-100).
    pub score: u8,
    /// Duration of the interaction in seconds.
    pub duration_seconds: u32,
    /// Bump seed for PDA derivation.
    pub bump: u8,
}

impl InteractionLog {
    pub const SEED: &'static [u8] = b"interaction";
    pub const SIZE: usize = 8 + 32 + 32 + 4 + 8 + 32 + 1 + 1 + 4 + 1;
}
