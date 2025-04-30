"""
Type definitions for the your.fun Python SDK.
Mirrors on-chain account structures and API request/response schemas.
"""

from __future__ import annotations
from dataclasses import dataclass, field
from enum import IntEnum
from typing import Optional


class InteractionType(IntEnum):
    """On-chain interaction type identifiers."""
    CHAT = 0
    QUIZ = 1
    EXERCISE = 2
    REVIEW = 3


class PersonalityType(IntEnum):
    """AI companion personality archetypes."""
    MENTOR = 0
    EXPLORER = 1
    CHALLENGER = 2
    COLLABORATOR = 3
    STORYTELLER = 4


@dataclass
class PlatformRegistry:
    """On-chain platform registry state."""
    authority: str
    verification_fee_lamports: int
    total_verified_humans: int
    total_sessions_created: int
    total_interactions: int
    is_paused: bool
    min_behavioral_score: int
    max_session_duration: int
    max_interactions_per_session: int
    bump: int


@dataclass
class HumanRecord:
    """On-chain human verification record."""
    wallet: str
    verified_by: str
    verified_at: int
    verification_level: int
    fingerprint_hash: bytes
    is_active: bool
    session_count: int
    total_interactions: int
    last_active_at: int
    learning_score: int
    challenge_nonce: bytes
    bump: int


@dataclass
class SessionAccount:
    """On-chain AI companion session."""
    human_record: str
    owner: str
    session_index: int
    created_at: int
    last_interaction_at: int
    expires_at: int
    is_active: bool
    interaction_count: int
    personality_id: int
    current_topic: bytes
    session_score: int
    bump: int


@dataclass
class InteractionLog:
    """On-chain interaction record."""
    session: str
    user: str
    interaction_index: int
    timestamp: int
    content_hash: bytes
    interaction_type: InteractionType
    score: int
    duration_seconds: int
    bump: int


@dataclass
class ChatMessage:
    """A single message in a conversation."""
    role: str
    content: str
    timestamp: int


@dataclass
class ChatResponse:
    """Response from the AI companion."""
    reply: str
    content_hash: str
    interaction_type: InteractionType
    suggested_score: int
    learning_insights: list[str] = field(default_factory=list)
    next_topic_suggestions: list[str] = field(default_factory=list)


@dataclass
class ChallengeRequest:
    """Proof-of-Human challenge request parameters."""
    wallet: str
    challenge_type: str


@dataclass
class ChallengeResponse:
    """Generated challenge from the verification server."""
    challenge_id: str
    challenge_data: str
    expires_at: int
    difficulty: int


@dataclass
class LearningProgress:
    """Progress tracker for a learning topic."""
    topic_id: str
    topic_name: str
    completed_lessons: int
    total_lessons: int
    current_score: int
    streak: int
    last_activity_at: int
    progress_percent: int = 0


@dataclass
class VerificationStatus:
    """On-chain verification status for a wallet."""
    is_registered: bool
    is_verified: bool
    verification_level: int
    verified_at: Optional[int]
    session_count: int
    total_interactions: int
    learning_score: int
