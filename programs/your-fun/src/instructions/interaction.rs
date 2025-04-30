use anchor_lang::prelude::*;
use crate::state::{PlatformRegistry, HumanRecord, SessionAccount, InteractionLog};
use crate::error::YourFunError;

#[derive(Accounts)]
#[instruction(content_hash: [u8; 32], interaction_type: u8)]
pub struct RecordInteraction<'info> {
    #[account(
        mut,
        seeds = [PlatformRegistry::SEED],
        bump = registry.bump,
    )]
    pub registry: Account<'info, PlatformRegistry>,

    #[account(
        mut,
        seeds = [HumanRecord::SEED, user.key().as_ref()],
        bump = human_record.bump,
        constraint = human_record.is_active @ YourFunError::HumanRecordRevoked,
    )]
    pub human_record: Account<'info, HumanRecord>,

    #[account(
        mut,
        seeds = [
            SessionAccount::SEED,
            human_record.key().as_ref(),
            &session.session_index.to_le_bytes(),
        ],
        bump = session.bump,
        constraint = session.is_active @ YourFunError::SessionInactive,
        constraint = session.owner == user.key() @ YourFunError::Unauthorized,
    )]
    pub session: Account<'info, SessionAccount>,

    #[account(
        init,
        payer = user,
        space = InteractionLog::SIZE,
        seeds = [
            InteractionLog::SEED,
            session.key().as_ref(),
            &session.interaction_count.to_le_bytes(),
        ],
        bump,
    )]
    pub interaction: Account<'info, InteractionLog>,

    #[account(mut)]
    pub user: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler_record_interaction(
    ctx: Context<RecordInteraction>,
    content_hash: [u8; 32],
    interaction_type: u8,
    score: u8,
    duration_seconds: u32,
) -> Result<()> {
    let registry = &mut ctx.accounts.registry;
    let human_record = &mut ctx.accounts.human_record;
    let session = &mut ctx.accounts.session;
    let interaction = &mut ctx.accounts.interaction;
    let clock = Clock::get()?;

    require!(
        session.expires_at > clock.unix_timestamp,
        YourFunError::SessionExpired
    );

    require!(
        session.interaction_count < registry.max_interactions_per_session,
        YourFunError::InteractionLimitReached
    );

    require!(
        interaction_type <= 3,
        YourFunError::InvalidContentHash
    );

    require!(score <= 100, YourFunError::InvalidVerificationLevel);

    let is_zero_hash = content_hash.iter().all(|&b| b == 0);
    require!(!is_zero_hash, YourFunError::InvalidContentHash);

    interaction.session = session.key();
    interaction.user = ctx.accounts.user.key();
    interaction.interaction_index = session.interaction_count;
    interaction.timestamp = clock.unix_timestamp;
    interaction.content_hash = content_hash;
    interaction.interaction_type = interaction_type;
    interaction.score = score;
    interaction.duration_seconds = duration_seconds;
    interaction.bump = ctx.bumps.interaction;

    session.interaction_count = session
        .interaction_count
        .checked_add(1)
        .ok_or(YourFunError::NumericalOverflow)?;
    session.last_interaction_at = clock.unix_timestamp;

    let score_increment = compute_score_increment(score, interaction_type, duration_seconds);
    session.session_score = session
        .session_score
        .checked_add(score_increment)
        .ok_or(YourFunError::NumericalOverflow)?;

    human_record.total_interactions = human_record
        .total_interactions
        .checked_add(1)
        .ok_or(YourFunError::NumericalOverflow)?;
    human_record.last_active_at = clock.unix_timestamp;

    registry.total_interactions = registry
        .total_interactions
        .checked_add(1)
        .ok_or(YourFunError::NumericalOverflow)?;

    msg!(
        "Interaction {} recorded: type={}, score={}, duration={}s",
        interaction.interaction_index,
        interaction_type,
        score,
        duration_seconds
    );

    Ok(())
}

/// Computes a weighted score increment based on interaction quality metrics.
///
/// The scoring formula applies multipliers based on interaction type:
///   - Chat (0): 1x base
///   - Quiz (1): 2x base
///   - Exercise (2): 3x base
///   - Review (3): 1.5x base
///
/// Duration acts as a diminishing-returns bonus capped at 300 seconds.
fn compute_score_increment(score: u8, interaction_type: u8, duration_seconds: u32) -> u64 {
    let base_score = score as u64;

    let type_multiplier: u64 = match interaction_type {
        0 => 100,
        1 => 200,
        2 => 300,
        3 => 150,
        _ => 100,
    };

    let capped_duration = std::cmp::min(duration_seconds, 300) as u64;
    let duration_bonus = capped_duration / 30;

    let weighted = base_score
        .saturating_mul(type_multiplier)
        .saturating_div(100);

    weighted.saturating_add(duration_bonus)
}
