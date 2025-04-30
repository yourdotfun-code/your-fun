"""
yourfun - Python SDK for the your.fun Proof-of-Human platform.

Provides async client interfaces for Proof-of-Human verification,
AI companion interactions, and Solana program communication.
"""

from yourfun.client import YourFunClient
from yourfun.proof import ProofGenerator
from yourfun.ai import AICompanion
from yourfun.solana import SolanaClient
from yourfun.types import (
    HumanRecord,
    SessionAccount,
    InteractionLog,
    PlatformRegistry,
    ChatMessage,
    ChatResponse,
    LearningProgress,
    VerificationStatus,
    InteractionType,
    PersonalityType,
    ChallengeRequest,
    ChallengeResponse,
)

__version__ = "0.1.0"
__all__ = [
    "YourFunClient",
    "ProofGenerator",
    "AICompanion",
    "SolanaClient",
    "HumanRecord",
    "SessionAccount",
    "InteractionLog",
    "PlatformRegistry",
    "ChatMessage",
    "ChatResponse",
    "LearningProgress",
    "VerificationStatus",
    "InteractionType",
    "PersonalityType",
    "ChallengeRequest",
    "ChallengeResponse",
]
