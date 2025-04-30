use anchor_lang::prelude::*;
use crate::state::{PlatformRegistry, HumanRecord};
use crate::error::YourFunError;

#[derive(Accounts)]
pub struct VerifyHuman<'info> {
    #[account(
        mut,
        seeds = [PlatformRegistry::SEED],
        bump = registry.bump,
    )]
    pub registry: Account<'info, PlatformRegistry>,

    #[account(
        mut,
        seeds = [HumanRecord::SEED, human_record.wallet.as_ref()],
        bump = human_record.bump,
        constraint = !human_record.is_active @ YourFunError::AlreadyVerified,
    )]
    pub human_record: Account<'info, HumanRecord>,

    /// The verifier authority that confirms the proof-of-human.
    pub verifier: Signer<'info>,
}

/// Verifies a human identity by confirming the challenge-response proof
/// and the behavioral analysis score.
///
/// The verification flow works as follows:
/// 1. The user initiates registration with a challenge nonce.
/// 2. An off-chain verifier analyzes behavioral data and generates a proof.
/// 3. The verifier submits the proof on-chain via this instruction.
/// 4. If the proof matches and the score passes the threshold, the human record is activated.
pub fn handler_verify_human(
    ctx: Context<VerifyHuman>,
    challenge_response: [u8; 32],
    behavioral_score: u8,
    verification_level: u8,
) -> Result<()> {
    let registry = &mut ctx.accounts.registry;
    let human_record = &mut ctx.accounts.human_record;

    require!(!registry.is_paused, YourFunError::RegistryPaused);

    require!(
        verification_level >= 1 && verification_level <= 3,
        YourFunError::InvalidVerificationLevel
    );

    require!(
        behavioral_score >= registry.min_behavioral_score,
        YourFunError::BehavioralScoreTooLow
    );

    let expected_response = compute_challenge_hash(
        &human_record.challenge_nonce,
        &human_record.fingerprint_hash,
    );

    require!(
        challenge_response == expected_response,
        YourFunError::ChallengeMismatch
    );

    let clock = Clock::get()?;
    human_record.verified_by = ctx.accounts.verifier.key();
    human_record.verified_at = clock.unix_timestamp;
    human_record.verification_level = verification_level;
    human_record.is_active = true;
    human_record.last_active_at = clock.unix_timestamp;

    registry.total_verified_humans = registry
        .total_verified_humans
        .checked_add(1)
        .ok_or(YourFunError::NumericalOverflow)?;

    msg!(
        "Human verified at level {} with behavioral score {}",
        verification_level,
        behavioral_score
    );

    Ok(())
}

/// Computes a deterministic challenge hash from the nonce and fingerprint.
/// Uses XOR folding as a lightweight on-chain hash combination.
fn compute_challenge_hash(nonce: &[u8; 32], fingerprint: &[u8; 32]) -> [u8; 32] {
    let mut result = [0u8; 32];
    for i in 0..32 {
        result[i] = nonce[i] ^ fingerprint[i];
        result[i] = result[i].wrapping_add(nonce[(i + 7) % 32]);
        result[i] ^= fingerprint[(i + 13) % 32];
    }

    for round in 0..4 {
        for i in 0..32 {
            let prev = result[(i + 31) % 32];
            let next = result[(i + 1) % 32];
            result[i] = result[i]
                .wrapping_add(prev.wrapping_mul(next))
                .wrapping_add(round as u8);
        }
    }

    result
}
