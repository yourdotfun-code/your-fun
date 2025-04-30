use anchor_lang::prelude::*;
use crate::state::{PlatformRegistry, HumanRecord, SessionAccount};
use crate::error::YourFunError;

#[derive(Accounts)]
#[instruction(personality_id: u8, initial_topic: [u8; 32])]
pub struct CreateSession<'info> {
    #[account(
        mut,
        seeds = [PlatformRegistry::SEED],
        bump = registry.bump,
    )]
    pub registry: Account<'info, PlatformRegistry>,

    #[account(
        mut,
        seeds = [HumanRecord::SEED, owner.key().as_ref()],
        bump = human_record.bump,
        constraint = human_record.is_active @ YourFunError::HumanRecordRevoked,
        constraint = human_record.wallet == owner.key() @ YourFunError::Unauthorized,
    )]
    pub human_record: Account<'info, HumanRecord>,

    #[account(
        init,
        payer = owner,
        space = SessionAccount::SIZE,
        seeds = [
            SessionAccount::SEED,
            human_record.key().as_ref(),
            &human_record.session_count.to_le_bytes(),
        ],
        bump,
    )]
    pub session: Account<'info, SessionAccount>,

    #[account(mut)]
    pub owner: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler_create_session(
    ctx: Context<CreateSession>,
    personality_id: u8,
    initial_topic: [u8; 32],
) -> Result<()> {
    let registry = &mut ctx.accounts.registry;
    let human_record = &mut ctx.accounts.human_record;
    let session = &mut ctx.accounts.session;
    let clock = Clock::get()?;

    require!(!registry.is_paused, YourFunError::RegistryPaused);

    let expires_at = clock
        .unix_timestamp
        .checked_add(registry.max_session_duration)
        .ok_or(YourFunError::NumericalOverflow)?;

    session.human_record = human_record.key();
    session.owner = ctx.accounts.owner.key();
    session.session_index = human_record.session_count;
    session.created_at = clock.unix_timestamp;
    session.last_interaction_at = clock.unix_timestamp;
    session.expires_at = expires_at;
    session.is_active = true;
    session.interaction_count = 0;
    session.personality_id = personality_id;
    session.current_topic = initial_topic;
    session.session_score = 0;
    session.bump = ctx.bumps.session;
    session._reserved = [0u8; 16];

    human_record.session_count = human_record
        .session_count
        .checked_add(1)
        .ok_or(YourFunError::NumericalOverflow)?;
    human_record.last_active_at = clock.unix_timestamp;

    registry.total_sessions_created = registry
        .total_sessions_created
        .checked_add(1)
        .ok_or(YourFunError::NumericalOverflow)?;

    msg!(
        "Session {} created with personality {}",
        session.session_index,
        personality_id
    );

    Ok(())
}

#[derive(Accounts)]
pub struct CloseSession<'info> {
    #[account(
        mut,
        seeds = [PlatformRegistry::SEED],
        bump = registry.bump,
    )]
    pub registry: Account<'info, PlatformRegistry>,

    #[account(
        mut,
        seeds = [HumanRecord::SEED, owner.key().as_ref()],
        bump = human_record.bump,
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
        constraint = session.owner == owner.key() @ YourFunError::Unauthorized,
    )]
    pub session: Account<'info, SessionAccount>,

    pub owner: Signer<'info>,
}

pub fn handler_close_session(ctx: Context<CloseSession>) -> Result<()> {
    let session = &mut ctx.accounts.session;
    let human_record = &mut ctx.accounts.human_record;
    let clock = Clock::get()?;

    session.is_active = false;
    session.last_interaction_at = clock.unix_timestamp;

    human_record.learning_score = human_record
        .learning_score
        .checked_add(session.session_score)
        .ok_or(YourFunError::NumericalOverflow)?;

    msg!(
        "Session {} closed with score {}",
        session.session_index,
        session.session_score
    );

    Ok(())
}

#[derive(Accounts)]
pub struct ExtendSession<'info> {
    #[account(
        seeds = [PlatformRegistry::SEED],
        bump = registry.bump,
    )]
    pub registry: Account<'info, PlatformRegistry>,

    #[account(
        seeds = [HumanRecord::SEED, owner.key().as_ref()],
        bump = human_record.bump,
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
        constraint = session.owner == owner.key() @ YourFunError::Unauthorized,
    )]
    pub session: Account<'info, SessionAccount>,

    pub owner: Signer<'info>,
}

pub fn handler_extend_session(
    ctx: Context<ExtendSession>,
    additional_duration: i64,
) -> Result<()> {
    let registry = &ctx.accounts.registry;
    let session = &mut ctx.accounts.session;
    let clock = Clock::get()?;

    require!(
        session.expires_at > clock.unix_timestamp,
        YourFunError::SessionExpired
    );

    let new_expiry = session
        .expires_at
        .checked_add(additional_duration)
        .ok_or(YourFunError::NumericalOverflow)?;

    let max_allowed = clock
        .unix_timestamp
        .checked_add(registry.max_session_duration * 2)
        .ok_or(YourFunError::NumericalOverflow)?;

    require!(
        new_expiry <= max_allowed,
        YourFunError::SessionDurationExceeded
    );

    session.expires_at = new_expiry;

    msg!(
        "Session {} extended to {}",
        session.session_index,
        new_expiry
    );

    Ok(())
}
