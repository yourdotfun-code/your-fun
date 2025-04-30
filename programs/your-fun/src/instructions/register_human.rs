use anchor_lang::prelude::*;
use anchor_lang::system_program;
use crate::state::{PlatformRegistry, HumanRecord};
use crate::error::YourFunError;

#[derive(Accounts)]
pub struct RegisterHuman<'info> {
    #[account(
        mut,
        seeds = [PlatformRegistry::SEED],
        bump = registry.bump,
    )]
    pub registry: Account<'info, PlatformRegistry>,

    #[account(
        init,
        payer = user,
        space = HumanRecord::SIZE,
        seeds = [HumanRecord::SEED, user.key().as_ref()],
        bump,
    )]
    pub human_record: Account<'info, HumanRecord>,

    #[account(mut)]
    pub user: Signer<'info>,

    /// The treasury account that receives the verification fee.
    /// CHECK: This is validated against the registry authority.
    #[account(
        mut,
        constraint = fee_receiver.key() == registry.authority @ YourFunError::AuthorityMismatch
    )]
    pub fee_receiver: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler_register_human(
    ctx: Context<RegisterHuman>,
    challenge_nonce: [u8; 32],
    fingerprint_hash: [u8; 32],
) -> Result<()> {
    let registry = &ctx.accounts.registry;

    require!(!registry.is_paused, YourFunError::RegistryPaused);

    if registry.verification_fee_lamports > 0 {
        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.user.to_account_info(),
                    to: ctx.accounts.fee_receiver.to_account_info(),
                },
            ),
            registry.verification_fee_lamports,
        )?;
    }

    let clock = Clock::get()?;
    let human_record = &mut ctx.accounts.human_record;

    human_record.wallet = ctx.accounts.user.key();
    human_record.verified_by = Pubkey::default();
    human_record.verified_at = 0;
    human_record.verification_level = 0;
    human_record.fingerprint_hash = fingerprint_hash;
    human_record.is_active = false;
    human_record.session_count = 0;
    human_record.total_interactions = 0;
    human_record.last_active_at = clock.unix_timestamp;
    human_record.learning_score = 0;
    human_record.challenge_nonce = challenge_nonce;
    human_record.bump = ctx.bumps.human_record;
    human_record._reserved = [0u8; 32];

    msg!(
        "Human registration initiated for wallet: {}",
        ctx.accounts.user.key()
    );

    Ok(())
}
