use anchor_lang::prelude::*;
use crate::state::PlatformRegistry;
use crate::error::YourFunError;

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = authority,
        space = PlatformRegistry::SIZE,
        seeds = [PlatformRegistry::SEED],
        bump,
    )]
    pub registry: Account<'info, PlatformRegistry>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler_initialize(
    ctx: Context<Initialize>,
    verification_fee_lamports: u64,
    min_behavioral_score: u8,
    max_session_duration: i64,
    max_interactions_per_session: u32,
) -> Result<()> {
    let registry = &mut ctx.accounts.registry;

    require!(
        min_behavioral_score <= 100,
        YourFunError::InvalidVerificationLevel
    );
    require!(
        max_session_duration > 0,
        YourFunError::SessionDurationExceeded
    );

    registry.authority = ctx.accounts.authority.key();
    registry.verification_fee_lamports = verification_fee_lamports;
    registry.total_verified_humans = 0;
    registry.total_sessions_created = 0;
    registry.total_interactions = 0;
    registry.is_paused = false;
    registry.min_behavioral_score = min_behavioral_score;
    registry.max_session_duration = max_session_duration;
    registry.max_interactions_per_session = max_interactions_per_session;
    registry.bump = ctx.bumps.registry;
    registry._reserved = [0u8; 64];

    msg!("Platform registry initialized with fee: {} lamports", verification_fee_lamports);
    Ok(())
}
