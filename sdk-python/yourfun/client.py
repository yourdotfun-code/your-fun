"""
Async HTTP client for the your.fun API.
Provides a unified interface for verification, AI chat, and learning operations.
"""

from __future__ import annotations
import time
import json
from typing import Optional, AsyncGenerator
import httpx
from nacl.signing import SigningKey
from nacl.encoding import RawEncoder
import base58

from yourfun.types import (
    ChatMessage,
    ChatResponse,
    ChallengeResponse,
    LearningProgress,
    VerificationStatus,
    InteractionType,
    PersonalityType,
)


class YourFunClient:
    """
    Async context manager client for the your.fun platform.

    Usage:
        async with YourFunClient(keypair, api_url) as client:
            status = await client.get_verification_status()
            if not status.is_verified:
                await client.request_challenge("behavioral")
    """

    def __init__(
        self,
        signing_key: SigningKey,
        api_base_url: str = "http://localhost:3100",
        timeout: float = 30.0,
    ):
        self._signing_key = signing_key
        self._verify_key = signing_key.verify_key
        self._wallet = base58.b58encode(
            bytes(self._verify_key)
        ).decode("ascii")
        self._api_base_url = api_base_url.rstrip("/")
        self._timeout = timeout
        self._http: Optional[httpx.AsyncClient] = None
        self._session_id: Optional[str] = None

    async def __aenter__(self) -> YourFunClient:
        self._http = httpx.AsyncClient(
            base_url=self._api_base_url,
            timeout=self._timeout,
            headers=self._build_auth_headers(),
        )
        return self

    async def __aexit__(self, *args) -> None:
        if self._http:
            await self._http.aclose()
            self._http = None

    @property
    def wallet(self) -> str:
        return self._wallet

    @property
    def session_id(self) -> Optional[str]:
        return self._session_id

    # -- Verification --

    async def request_challenge(
        self, challenge_type: str = "behavioral"
    ) -> ChallengeResponse:
        """Requests a new Proof-of-Human challenge from the server."""
        response = await self._post("/api/verify/challenge", {
            "wallet": self._wallet,
            "challengeType": challenge_type,
        })
        data = response.json()
        return ChallengeResponse(
            challenge_id=data["challengeId"],
            challenge_data=data["challengeData"],
            expires_at=data["expiresAt"],
            difficulty=data["difficulty"],
        )

    async def submit_verification(
        self,
        challenge_id: str,
        response_data: dict,
        fingerprint_data: dict,
    ) -> dict:
        """Submits a challenge response for verification."""
        response = await self._post("/api/verify/submit", {
            "challengeId": challenge_id,
            "response": response_data,
            "fingerprintData": fingerprint_data,
            "wallet": self._wallet,
        })
        return response.json()

    async def get_verification_status(self) -> VerificationStatus:
        """Checks the on-chain verification status of the connected wallet."""
        response = await self._get(f"/api/verify/status/{self._wallet}")
        data = response.json()
        return VerificationStatus(
            is_registered=data["isRegistered"],
            is_verified=data["isVerified"],
            verification_level=data["verificationLevel"],
            verified_at=data.get("verifiedAt"),
            session_count=data["sessionCount"],
            total_interactions=data["totalInteractions"],
            learning_score=data["learningScore"],
        )

    # -- AI Companion --

    async def start_session(
        self,
        topic_name: str,
        personality: PersonalityType = PersonalityType.MENTOR,
    ) -> str:
        """Starts a new AI companion session and returns the session ID."""
        response = await self._post("/api/chat/session", {
            "personalityId": int(personality),
            "topicName": topic_name,
        })
        data = response.json()
        self._session_id = data["sessionId"]
        return self._session_id

    async def chat(
        self,
        message: str,
        context: Optional[list[ChatMessage]] = None,
    ) -> ChatResponse:
        """Sends a message to the AI companion and returns the full response."""
        if not self._session_id:
            raise RuntimeError("No active session. Call start_session() first.")

        payload: dict = {
            "sessionId": self._session_id,
            "message": message,
        }
        if context:
            payload["context"] = [
                {"role": m.role, "content": m.content, "timestamp": m.timestamp}
                for m in context
            ]

        response = await self._post("/api/chat", payload)
        data = response.json()

        return ChatResponse(
            reply=data["reply"],
            content_hash=data["contentHash"],
            interaction_type=InteractionType(data["interactionType"]),
            suggested_score=data["suggestedScore"],
            learning_insights=data.get("learningInsights", []),
            next_topic_suggestions=data.get("nextTopicSuggestions", []),
        )

    async def chat_stream(
        self, message: str
    ) -> AsyncGenerator[str, None]:
        """Sends a message and yields response tokens as they arrive."""
        if not self._session_id:
            raise RuntimeError("No active session. Call start_session() first.")

        async with self._http.stream(
            "POST",
            "/api/chat/stream",
            json={
                "sessionId": self._session_id,
                "message": message,
            },
            headers={"Accept": "text/event-stream"},
        ) as response:
            response.raise_for_status()
            async for line in response.aiter_lines():
                if line.startswith("data: "):
                    payload = line[6:]
                    if payload == "[DONE]":
                        break
                    try:
                        parsed = json.loads(payload)
                        if parsed.get("type") == "token" and parsed.get("content"):
                            yield parsed["content"]
                    except json.JSONDecodeError:
                        yield payload

    async def close_session(self) -> dict:
        """Closes the current AI companion session."""
        if not self._session_id:
            raise RuntimeError("No active session to close.")

        response = await self._delete(
            f"/api/chat/session/{self._session_id}"
        )
        self._session_id = None
        return response.json()

    # -- Learning --

    async def get_topics(self) -> list[dict]:
        """Returns all available learning topics."""
        response = await self._get("/api/learn/topics")
        return response.json()["topics"]

    async def get_topic(self, topic_id: str) -> dict:
        """Returns detailed information about a specific topic."""
        response = await self._get(f"/api/learn/topics/{topic_id}")
        return response.json()

    async def get_progress(self) -> list[LearningProgress]:
        """Returns learning progress across all topics."""
        response = await self._get("/api/learn/progress")
        data = response.json()["progress"]
        return [
            LearningProgress(
                topic_id=p["topicId"],
                topic_name=p["topicName"],
                completed_lessons=p["completedLessons"],
                total_lessons=p["totalLessons"],
                current_score=p["currentScore"],
                streak=p["streak"],
                last_activity_at=p["lastActivityAt"],
                progress_percent=p.get("progressPercent", 0),
            )
            for p in data
        ]

    async def complete_lesson(
        self, topic_id: str, lesson_id: str, score: int
    ) -> dict:
        """Marks a lesson as completed with the given score."""
        response = await self._post("/api/learn/complete", {
            "topicId": topic_id,
            "lessonId": lesson_id,
            "score": score,
        })
        return response.json()

    async def submit_quiz_answer(
        self, question_id: str, answer: str
    ) -> ChatResponse:
        """Submits a quiz answer and gets AI-powered feedback."""
        response = await self._post("/api/learn/quiz/submit", {
            "sessionId": self._session_id,
            "questionId": question_id,
            "answer": answer,
        })
        data = response.json()
        return ChatResponse(
            reply=data["reply"],
            content_hash=data["contentHash"],
            interaction_type=InteractionType(data["interactionType"]),
            suggested_score=data["suggestedScore"],
            learning_insights=data.get("learningInsights", []),
            next_topic_suggestions=data.get("nextTopicSuggestions", []),
        )

    # -- Internal HTTP helpers --

    def _build_auth_headers(self) -> dict[str, str]:
        timestamp = str(int(time.time()))
        message = f"your.fun-auth:{timestamp}"
        message_bytes = message.encode("utf-8")

        signed = self._signing_key.sign(message_bytes, encoder=RawEncoder)
        signature = signed.signature

        wallet_b58 = self._wallet
        sig_b58 = base58.b58encode(signature).decode("ascii")
        token = f"{wallet_b58}.{sig_b58}.{timestamp}"

        return {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        }

    async def _get(self, path: str) -> httpx.Response:
        self._refresh_auth()
        response = await self._http.get(path)
        response.raise_for_status()
        return response

    async def _post(self, path: str, data: dict) -> httpx.Response:
        self._refresh_auth()
        response = await self._http.post(path, json=data)
        response.raise_for_status()
        return response

    async def _delete(self, path: str) -> httpx.Response:
        self._refresh_auth()
        response = await self._http.delete(path)
        response.raise_for_status()
        return response

    def _refresh_auth(self) -> None:
        """Refreshes the authentication token if needed."""
        if self._http:
            self._http.headers.update(self._build_auth_headers())
