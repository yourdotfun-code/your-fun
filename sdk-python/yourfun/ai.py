"""
AI companion interface for the your.fun Python SDK.
Provides async chat, streaming, and learning path interactions.
"""

from __future__ import annotations
import json
import time
from typing import Optional, AsyncGenerator
import httpx

from yourfun.types import (
    ChatMessage,
    ChatResponse,
    InteractionType,
    PersonalityType,
    LearningProgress,
)


PERSONALITY_PROMPTS: dict[PersonalityType, str] = {
    PersonalityType.MENTOR: (
        "You are a patient and knowledgeable mentor who guides learners step by step. "
        "You explain complex concepts with clarity and encourage questions. "
        "You celebrate progress and provide constructive feedback."
    ),
    PersonalityType.EXPLORER: (
        "You are a curious explorer who loves discovering new ideas together. "
        "You ask thought-provoking questions and encourage learners to think "
        "outside the box. You connect seemingly unrelated concepts."
    ),
    PersonalityType.CHALLENGER: (
        "You are a challenging instructor who pushes learners to their limits. "
        "You present difficult problems, play devil's advocate, and expect "
        "rigorous analysis. You reward precision and depth."
    ),
    PersonalityType.COLLABORATOR: (
        "You are a collaborative partner who works alongside the learner. "
        "You share your own thinking process, brainstorm solutions together, "
        "and build on ideas. You value teamwork and shared discovery."
    ),
    PersonalityType.STORYTELLER: (
        "You are a captivating storyteller who teaches through narratives. "
        "You weave technical concepts into engaging stories, use analogies "
        "from everyday life, and make learning memorable through vivid examples."
    ),
}


class AICompanion:
    """
    Standalone AI companion interface for direct use.

    Usage:
        companion = AICompanion(api_url, auth_token)
        session_id = await companion.start_session("Solana Basics")
        response = await companion.chat("What is a PDA?")
        print(response.reply)
    """

    def __init__(
        self,
        api_base_url: str,
        auth_token: str,
        personality: PersonalityType = PersonalityType.MENTOR,
        max_context_length: int = 20,
    ) -> None:
        self._api_base_url = api_base_url.rstrip("/")
        self._auth_token = auth_token
        self._personality = personality
        self._max_context_length = max_context_length
        self._session_id: Optional[str] = None
        self._history: list[ChatMessage] = []
        self._http = httpx.AsyncClient(
            base_url=self._api_base_url,
            timeout=30.0,
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {auth_token}",
            },
        )

    async def start_session(self, topic_name: str) -> str:
        """Starts a new conversation session."""
        response = await self._http.post("/api/chat/session", json={
            "personalityId": int(self._personality),
            "topicName": topic_name,
        })
        response.raise_for_status()
        data = response.json()
        self._session_id = data["sessionId"]

        self._history.clear()
        system_prompt = self._build_system_prompt(topic_name)
        self._history.append(ChatMessage(
            role="system",
            content=system_prompt,
            timestamp=int(time.time() * 1000),
        ))

        return self._session_id

    async def chat(self, message: str) -> ChatResponse:
        """Sends a message and returns the complete response."""
        if not self._session_id:
            raise RuntimeError("No active session. Call start_session() first.")

        user_msg = ChatMessage(
            role="user",
            content=message,
            timestamp=int(time.time() * 1000),
        )
        self._history.append(user_msg)

        context_window = self._get_context_window()
        response = await self._http.post("/api/chat", json={
            "sessionId": self._session_id,
            "message": message,
            "personalityId": int(self._personality),
            "context": [
                {"role": m.role, "content": m.content, "timestamp": m.timestamp}
                for m in context_window
            ],
        })
        response.raise_for_status()
        data = response.json()

        assistant_msg = ChatMessage(
            role="assistant",
            content=data["reply"],
            timestamp=int(time.time() * 1000),
        )
        self._history.append(assistant_msg)

        return ChatResponse(
            reply=data["reply"],
            content_hash=data["contentHash"],
            interaction_type=InteractionType(data["interactionType"]),
            suggested_score=data["suggestedScore"],
            learning_insights=data.get("learningInsights", []),
            next_topic_suggestions=data.get("nextTopicSuggestions", []),
        )

    async def chat_stream(self, message: str) -> AsyncGenerator[str, None]:
        """Sends a message and yields response tokens via SSE."""
        if not self._session_id:
            raise RuntimeError("No active session. Call start_session() first.")

        user_msg = ChatMessage(
            role="user",
            content=message,
            timestamp=int(time.time() * 1000),
        )
        self._history.append(user_msg)

        async with self._http.stream(
            "POST",
            "/api/chat/stream",
            json={
                "sessionId": self._session_id,
                "message": message,
                "personalityId": int(self._personality),
            },
            headers={"Accept": "text/event-stream"},
        ) as response:
            response.raise_for_status()
            full_reply = ""
            async for line in response.aiter_lines():
                if line.startswith("data: "):
                    payload = line[6:]
                    if payload == "[DONE]":
                        break
                    try:
                        parsed = json.loads(payload)
                        if parsed.get("type") == "token" and parsed.get("content"):
                            full_reply += parsed["content"]
                            yield parsed["content"]
                    except json.JSONDecodeError:
                        full_reply += payload
                        yield payload

            self._history.append(ChatMessage(
                role="assistant",
                content=full_reply,
                timestamp=int(time.time() * 1000),
            ))

    async def generate_quiz(
        self, topic_id: str, difficulty: int = 5
    ) -> ChatResponse:
        """Generates a quiz question for the given topic."""
        prompt = (
            f"Generate a quiz question about the current topic (ID: {topic_id}) "
            f"at difficulty level {difficulty}/10. Include the correct answer and "
            f"an explanation. Format as a structured learning exercise."
        )
        return await self.chat(prompt)

    async def get_learning_progress(self) -> list[LearningProgress]:
        """Retrieves learning progress from the API."""
        response = await self._http.get("/api/learn/progress")
        response.raise_for_status()
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

    @property
    def conversation_history(self) -> list[ChatMessage]:
        return list(self._history)

    def clear_history(self) -> None:
        """Clears conversation history, keeping only the system prompt."""
        system_msgs = [m for m in self._history if m.role == "system"]
        self._history = system_msgs

    def set_personality(self, personality: PersonalityType) -> None:
        """Changes the companion personality mid-session."""
        self._personality = personality
        for i, msg in enumerate(self._history):
            if msg.role == "system":
                self._history[i] = ChatMessage(
                    role="system",
                    content=PERSONALITY_PROMPTS.get(personality, ""),
                    timestamp=msg.timestamp,
                )
                break

    async def close(self) -> None:
        """Closes the HTTP client."""
        await self._http.aclose()

    # -- Private helpers --

    def _get_context_window(self) -> list[ChatMessage]:
        if len(self._history) <= self._max_context_length:
            return list(self._history)

        system_msgs = [m for m in self._history if m.role == "system"]
        recent = [m for m in self._history if m.role != "system"]
        cut = self._max_context_length - len(system_msgs)
        return system_msgs + recent[-cut:]

    def _build_system_prompt(self, topic_name: str) -> str:
        personality_prompt = PERSONALITY_PROMPTS.get(
            self._personality, PERSONALITY_PROMPTS[PersonalityType.MENTOR]
        )
        return (
            f"{personality_prompt}\n\n"
            f"The current learning topic is: {topic_name}. "
            f"Engage the learner on this topic using your designated approach. "
            f"Track their understanding and adapt the difficulty to their level. "
            f"When appropriate, suggest exercises or quizzes to reinforce learning."
        )
