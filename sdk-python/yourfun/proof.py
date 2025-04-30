"""
Proof-of-Human fingerprint generator for the your.fun platform.
Collects behavioral interaction data and produces cryptographic fingerprints
suitable for on-chain verification.
"""

from __future__ import annotations
import hashlib
import os
import math
import time
from dataclasses import dataclass, field
from typing import Optional
import struct


@dataclass
class BehavioralEvent:
    """A single captured behavioral event."""
    event_type: str
    timestamp: float
    data: dict[str, float]


@dataclass
class BehavioralMetrics:
    """Aggregated metrics from behavioral event analysis."""
    keystroke_timing_variance: float
    mouse_movement_entropy: float
    scroll_pattern_score: float
    focus_switch_frequency: float
    idle_pattern_score: float
    total_events: int
    session_duration_ms: float


@dataclass
class FingerprintResult:
    """Generated fingerprint output for on-chain registration."""
    hash_bytes: bytes
    metrics: BehavioralMetrics
    confidence: float


class ProofGenerator:
    """
    Collects and analyzes behavioral data to generate a Proof-of-Human fingerprint.

    Usage:
        generator = ProofGenerator()
        generator.record_keystroke(down_time, up_time)
        generator.record_mouse_movement(x, y, timestamp)

        if generator.is_ready():
            result = generator.generate_fingerprint()
            nonce = generator.generate_challenge_nonce()
            solution = generator.solve_challenge(nonce, result.hash_bytes)
    """

    MIN_EVENTS_REQUIRED = 50
    MIN_SESSION_DURATION_MS = 5000.0

    def __init__(self) -> None:
        self._events: list[BehavioralEvent] = []
        self._session_start: float = time.time() * 1000

    def record_keystroke(self, key_down_time: float, key_up_time: float) -> None:
        """Records a keystroke timing event with hold duration and interval."""
        hold_duration = key_up_time - key_down_time
        interval = 0.0
        if self._events:
            interval = key_down_time - self._events[-1].timestamp

        self._events.append(BehavioralEvent(
            event_type="keystroke",
            timestamp=key_down_time,
            data={
                "hold_duration": hold_duration,
                "interval": interval,
                "key_up_time": key_up_time,
            },
        ))

    def record_mouse_movement(self, x: float, y: float, timestamp: float) -> None:
        """Records a mouse movement with computed velocity and acceleration."""
        velocity = 0.0
        acceleration = 0.0

        last_mouse = self._get_last_event_of_type("mouse")
        if last_mouse:
            dt = timestamp - last_mouse.timestamp
            if dt > 0:
                dx = x - last_mouse.data.get("x", 0)
                dy = y - last_mouse.data.get("y", 0)
                velocity = math.sqrt(dx * dx + dy * dy) / dt
                prev_velocity = last_mouse.data.get("velocity", 0)
                if prev_velocity > 0:
                    acceleration = (velocity - prev_velocity) / dt

        self._events.append(BehavioralEvent(
            event_type="mouse",
            timestamp=timestamp,
            data={"x": x, "y": y, "velocity": velocity, "acceleration": acceleration},
        ))

    def record_scroll(self, delta_y: float, timestamp: float) -> None:
        """Records a scroll event with direction and intensity."""
        self._events.append(BehavioralEvent(
            event_type="scroll",
            timestamp=timestamp,
            data={"delta_y": delta_y, "intensity": abs(delta_y)},
        ))

    def record_focus_change(self, has_focus: bool, timestamp: float) -> None:
        """Records a window focus change event."""
        self._events.append(BehavioralEvent(
            event_type="focus",
            timestamp=timestamp,
            data={"has_focus": 1.0 if has_focus else 0.0},
        ))

    def record_idle_period(self, start_time: float, end_time: float) -> None:
        """Records a detected idle period."""
        self._events.append(BehavioralEvent(
            event_type="idle",
            timestamp=start_time,
            data={"duration": end_time - start_time},
        ))

    def compute_metrics(self) -> BehavioralMetrics:
        """Computes aggregated behavioral metrics from all recorded events."""
        session_duration_ms = time.time() * 1000 - self._session_start

        keystrokes = [e for e in self._events if e.event_type == "keystroke"]
        intervals = [e.data["interval"] for e in keystrokes if e.data["interval"] > 0]
        keystroke_variance = self._compute_variance(intervals)

        mouse_events = [e for e in self._events if e.event_type == "mouse"]
        velocities = [e.data["velocity"] for e in mouse_events]
        mouse_entropy = self._compute_entropy(velocities)

        scroll_events = [e for e in self._events if e.event_type == "scroll"]
        scroll_score = self._compute_scroll_pattern(scroll_events)

        focus_events = [e for e in self._events if e.event_type == "focus"]
        focus_freq = len(focus_events) / max(session_duration_ms / 1000, 0.001)

        idle_events = [e for e in self._events if e.event_type == "idle"]
        idle_score = self._compute_idle_pattern(idle_events, session_duration_ms)

        return BehavioralMetrics(
            keystroke_timing_variance=keystroke_variance,
            mouse_movement_entropy=mouse_entropy,
            scroll_pattern_score=scroll_score,
            focus_switch_frequency=focus_freq,
            idle_pattern_score=idle_score,
            total_events=len(self._events),
            session_duration_ms=session_duration_ms,
        )

    def generate_fingerprint(self) -> FingerprintResult:
        """Generates a 32-byte SHA-256 fingerprint hash from behavioral metrics."""
        metrics = self.compute_metrics()

        data_buffer = struct.pack(
            ">dddddId",
            metrics.keystroke_timing_variance,
            metrics.mouse_movement_entropy,
            metrics.scroll_pattern_score,
            metrics.focus_switch_frequency,
            metrics.idle_pattern_score,
            metrics.total_events,
            metrics.session_duration_ms,
        )

        hash_bytes = hashlib.sha256(data_buffer).digest()
        confidence = self._compute_confidence(metrics)

        return FingerprintResult(
            hash_bytes=hash_bytes,
            metrics=metrics,
            confidence=confidence,
        )

    def generate_challenge_nonce(self) -> bytes:
        """Generates a cryptographically secure 32-byte challenge nonce."""
        return os.urandom(32)

    def solve_challenge(self, nonce: bytes, fingerprint_hash: bytes) -> bytes:
        """
        Solves a verification challenge using the nonce and fingerprint hash.
        This must produce output identical to the on-chain compute_challenge_hash.
        """
        result = bytearray(32)

        for i in range(32):
            result[i] = nonce[i] ^ fingerprint_hash[i]
            result[i] = (result[i] + nonce[(i + 7) % 32]) & 0xFF
            result[i] ^= fingerprint_hash[(i + 13) % 32]

        for round_num in range(4):
            for i in range(32):
                prev = result[(i + 31) % 32]
                nxt = result[(i + 1) % 32]
                result[i] = (result[i] + ((prev * nxt) & 0xFF) + round_num) & 0xFF

        return bytes(result)

    def is_ready(self) -> bool:
        """Returns whether enough data has been collected for verification."""
        session_duration = time.time() * 1000 - self._session_start
        return (
            len(self._events) >= self.MIN_EVENTS_REQUIRED
            and session_duration >= self.MIN_SESSION_DURATION_MS
        )

    @property
    def event_count(self) -> int:
        return len(self._events)

    def reset(self) -> None:
        """Resets all collected behavioral data."""
        self._events.clear()
        self._session_start = time.time() * 1000

    # -- Private computational methods --

    @staticmethod
    def _compute_variance(values: list[float]) -> float:
        if len(values) < 2:
            return 0.0
        mean = sum(values) / len(values)
        return sum((v - mean) ** 2 for v in values) / (len(values) - 1)

    @staticmethod
    def _compute_entropy(values: list[float]) -> float:
        if len(values) < 2:
            return 0.0

        bin_count = 20
        min_val = min(values)
        max_val = max(values)
        range_val = max_val - min_val if max_val != min_val else 1.0
        bins = [0] * bin_count

        for value in values:
            bin_idx = min(int(((value - min_val) / range_val) * bin_count), bin_count - 1)
            bins[bin_idx] += 1

        entropy = 0.0
        n = len(values)
        for count in bins:
            if count > 0:
                p = count / n
                entropy -= p * math.log2(p)

        return entropy

    @staticmethod
    def _compute_scroll_pattern(scroll_events: list[BehavioralEvent]) -> float:
        if len(scroll_events) < 3:
            return 0.0

        direction_changes = 0
        prev_direction = 0

        for event in scroll_events:
            direction = 1 if event.data["delta_y"] > 0 else -1
            if prev_direction != 0 and direction != prev_direction:
                direction_changes += 1
            prev_direction = direction

        change_ratio = direction_changes / len(scroll_events)
        intensities = [e.data["intensity"] for e in scroll_events]
        intensity_variance = ProofGenerator._compute_variance(intensities)

        return change_ratio * 50 + min(intensity_variance / 100, 50)

    @staticmethod
    def _compute_idle_pattern(
        idle_events: list[BehavioralEvent], session_duration_ms: float
    ) -> float:
        if not idle_events:
            return 100.0

        total_idle = sum(e.data["duration"] for e in idle_events)
        idle_ratio = total_idle / max(session_duration_ms, 1.0)

        durations = [e.data["duration"] for e in idle_events]
        duration_variance = ProofGenerator._compute_variance(durations)

        base_score = (1 - idle_ratio) * 70
        variance_bonus = min(duration_variance / 10000, 30)

        return base_score + variance_bonus

    @staticmethod
    def _compute_confidence(metrics: BehavioralMetrics) -> float:
        score = 0.0

        if metrics.total_events >= 100:
            score += 20
        elif metrics.total_events >= 50:
            score += 10

        if metrics.session_duration_ms >= 30000:
            score += 20
        elif metrics.session_duration_ms >= 10000:
            score += 10

        if metrics.keystroke_timing_variance > 1000:
            score += 15
        if metrics.mouse_movement_entropy > 2.0:
            score += 15
        if metrics.scroll_pattern_score > 30:
            score += 10
        if 0.05 < metrics.focus_switch_frequency < 2.0:
            score += 10
        if metrics.idle_pattern_score > 50:
            score += 10

        return min(score, 100.0)

    def _get_last_event_of_type(self, event_type: str) -> Optional[BehavioralEvent]:
        for event in reversed(self._events):
            if event.event_type == event_type:
                return event
        return None
