use anchor_lang::prelude::*;

pub mod error;
pub mod instructions;
pub mod state;

use instructions::*;

declare_id!("YRFunHP2kVerify1111111111111111111111111111");

#[program]
pub mod your_fun {
    use super::*;

    /// Initializes the platform registry with global configuration.
    /// Can only be called once by the deploying authority.
    pub fn initialize(
        ctx: Context<Initialize>,
        verification_fee_lamports: u64,
        min_behavioral_score: u8,
        max_session_duration: i64,
        max_interactions_per_session: u32,
    ) -> Result<()> {
        handler_initialize(
            ctx,
            verification_fee_lamports,
            min_behavioral_score,
            max_session_duration,
            max_interactions_per_session,
        )
    }

    /// Begins the human verification process.
    /// Creates a HumanRecord PDA with challenge data for subsequent verification.
    pub fn register_human(
        ctx: Context<RegisterHuman>,
        challenge_nonce: [u8; 32],
        fingerprint_hash: [u8; 32],
    ) -> Result<()> {
        handler_register_human(ctx, challenge_nonce, fingerprint_hash)
    }

    /// Completes the human verification process.
    /// The verifier confirms the challenge-response and behavioral score.
    pub fn verify_human(
        ctx: Context<VerifyHuman>,
        challenge_response: [u8; 32],
        behavioral_score: u8,
        verification_level: u8,
    ) -> Result<()> {
        handler_verify_human(ctx, challenge_response, behavioral_score, verification_level)
    }

    /// Creates a new AI companion session for a verified human.
    pub fn create_session(
        ctx: Context<CreateSession>,
        personality_id: u8,
        initial_topic: [u8; 32],
    ) -> Result<()> {
        handler_create_session(ctx, personality_id, initial_topic)
    }

    /// Closes an active session and accumulates the session score.
    pub fn close_session(ctx: Context<CloseSession>) -> Result<()> {
        handler_close_session(ctx)
    }

    /// Extends the expiration of an active session.
    pub fn extend_session(
        ctx: Context<ExtendSession>,
        additional_duration: i64,
    ) -> Result<()> {
        handler_extend_session(ctx, additional_duration)
    }

    /// Records a learning interaction within an active session.
    pub fn record_interaction(
        ctx: Context<RecordInteraction>,
        content_hash: [u8; 32],
        interaction_type: u8,
        score: u8,
        duration_seconds: u32,
    ) -> Result<()> {
        handler_record_interaction(ctx, content_hash, interaction_type, score, duration_seconds)
    }
}
