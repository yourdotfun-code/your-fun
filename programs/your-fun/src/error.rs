use anchor_lang::prelude::*;

#[error_code]
pub enum YourFunError {
    #[msg("The provided proof data is invalid or corrupted")]
    InvalidProof,

    #[msg("This wallet has already been verified as human")]
    AlreadyVerified,

    #[msg("The verification session has expired")]
    SessionExpired,

    #[msg("You are not authorized to perform this action")]
    Unauthorized,

    #[msg("The platform registry is currently paused")]
    RegistryPaused,

    #[msg("The challenge response does not match the expected value")]
    ChallengeMismatch,

    #[msg("The fingerprint data exceeds the maximum allowed length")]
    FingerprintTooLong,

    #[msg("The session is no longer active")]
    SessionInactive,

    #[msg("The interaction content hash is malformed")]
    InvalidContentHash,

    #[msg("The provided timestamp is in the future")]
    FutureTimestamp,

    #[msg("Maximum number of interactions per session has been reached")]
    InteractionLimitReached,

    #[msg("The verification level provided is out of valid range")]
    InvalidVerificationLevel,

    #[msg("The behavioral analysis score is below the minimum threshold")]
    BehavioralScoreTooLow,

    #[msg("The session duration exceeds the maximum allowed period")]
    SessionDurationExceeded,

    #[msg("The content hash must be exactly 32 bytes")]
    ContentHashLengthInvalid,

    #[msg("The companion personality identifier is invalid")]
    InvalidPersonalityId,

    #[msg("This human record has been revoked and cannot be reactivated")]
    HumanRecordRevoked,

    #[msg("The registry authority does not match the signer")]
    AuthorityMismatch,

    #[msg("Numerical overflow occurred during computation")]
    NumericalOverflow,
}
