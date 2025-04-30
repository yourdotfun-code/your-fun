import { createHash, randomBytes } from "crypto";

/**
 * Client-side Proof-of-Human generation toolkit.
 *
 * Generates behavioral fingerprints and challenge responses for
 * the your.fun verification pipeline. The fingerprint captures
 * interaction timing, input entropy, and cognitive response patterns.
 */

/**
 * Raw behavioral event captured from user interactions.
 */
interface BehavioralEvent {
    type: "keystroke" | "mouse" | "scroll" | "focus" | "idle";
    timestamp: number;
    data: Record<string, number>;
}

/**
 * Aggregated behavioral metrics from a collection of events.
 */
interface BehavioralMetrics {
    keystrokeTimingVariance: number;
    mouseMovementEntropy: number;
    scrollPatternScore: number;
    focusSwitchFrequency: number;
    idlePatternScore: number;
    totalEvents: number;
    sessionDurationMs: number;
}

/**
 * Final fingerprint output for on-chain registration.
 */
interface FingerprintOutput {
    hash: Uint8Array;
    metrics: BehavioralMetrics;
    confidence: number;
}

/**
 * Collects and analyzes behavioral data to generate a Proof-of-Human fingerprint.
 */
export class ProofGenerator {
    private events: BehavioralEvent[] = [];
    private sessionStartTime: number;
    private readonly minEventsRequired = 50;
    private readonly minSessionDurationMs = 5000;

    constructor() {
        this.sessionStartTime = Date.now();
    }

    /**
     * Records a keystroke timing event.
     * Captures the interval between keypresses and the hold duration.
     */
    recordKeystroke(keyDownTime: number, keyUpTime: number): void {
        const holdDuration = keyUpTime - keyDownTime;
        const interval = this.events.length > 0
            ? keyDownTime - this.events[this.events.length - 1].timestamp
            : 0;

        this.events.push({
            type: "keystroke",
            timestamp: keyDownTime,
            data: {
                holdDuration,
                interval,
                keyUpTime,
            },
        });
    }

    /**
     * Records a mouse movement event.
     * Captures position, velocity, and acceleration vectors.
     */
    recordMouseMovement(x: number, y: number, timestamp: number): void {
        const lastMouse = this.getLastEventOfType("mouse");
        let velocity = 0;
        let acceleration = 0;

        if (lastMouse) {
            const dt = timestamp - lastMouse.timestamp;
            if (dt > 0) {
                const dx = x - lastMouse.data.x;
                const dy = y - lastMouse.data.y;
                velocity = Math.sqrt(dx * dx + dy * dy) / dt;

                if (lastMouse.data.velocity > 0) {
                    acceleration = (velocity - lastMouse.data.velocity) / dt;
                }
            }
        }

        this.events.push({
            type: "mouse",
            timestamp,
            data: { x, y, velocity, acceleration },
        });
    }

    /**
     * Records a scroll event with direction and intensity.
     */
    recordScroll(deltaY: number, timestamp: number): void {
        this.events.push({
            type: "scroll",
            timestamp,
            data: {
                deltaY,
                intensity: Math.abs(deltaY),
            },
        });
    }

    /**
     * Records a focus change event (tab switching, window focus).
     */
    recordFocusChange(hasFocus: boolean, timestamp: number): void {
        this.events.push({
            type: "focus",
            timestamp,
            data: {
                hasFocus: hasFocus ? 1 : 0,
            },
        });
    }

    /**
     * Records an idle state detection based on inactivity threshold.
     */
    recordIdlePeriod(startTime: number, endTime: number): void {
        this.events.push({
            type: "idle",
            timestamp: startTime,
            data: {
                duration: endTime - startTime,
            },
        });
    }

    /**
     * Computes aggregated behavioral metrics from recorded events.
     */
    computeMetrics(): BehavioralMetrics {
        const sessionDurationMs = Date.now() - this.sessionStartTime;

        const keystrokes = this.events.filter((e) => e.type === "keystroke");
        const keystrokeTimingVariance = this.computeVariance(
            keystrokes.map((e) => e.data.interval).filter((v) => v > 0)
        );

        const mouseEvents = this.events.filter((e) => e.type === "mouse");
        const mouseMovementEntropy = this.computeEntropy(
            mouseEvents.map((e) => e.data.velocity)
        );

        const scrollEvents = this.events.filter((e) => e.type === "scroll");
        const scrollPatternScore = this.computeScrollPattern(scrollEvents);

        const focusEvents = this.events.filter((e) => e.type === "focus");
        const focusSwitchFrequency = focusEvents.length / (sessionDurationMs / 1000);

        const idleEvents = this.events.filter((e) => e.type === "idle");
        const idlePatternScore = this.computeIdlePattern(idleEvents, sessionDurationMs);

        return {
            keystrokeTimingVariance,
            mouseMovementEntropy,
            scrollPatternScore,
            focusSwitchFrequency,
            idlePatternScore,
            totalEvents: this.events.length,
            sessionDurationMs,
        };
    }

    /**
     * Generates the final fingerprint hash from behavioral metrics.
     * Returns a 32-byte hash suitable for on-chain storage.
     */
    generateFingerprint(): FingerprintOutput {
        const metrics = this.computeMetrics();

        const dataBuffer = Buffer.alloc(56);
        dataBuffer.writeDoubleBE(metrics.keystrokeTimingVariance, 0);
        dataBuffer.writeDoubleBE(metrics.mouseMovementEntropy, 8);
        dataBuffer.writeDoubleBE(metrics.scrollPatternScore, 16);
        dataBuffer.writeDoubleBE(metrics.focusSwitchFrequency, 24);
        dataBuffer.writeDoubleBE(metrics.idlePatternScore, 32);
        dataBuffer.writeUInt32BE(metrics.totalEvents, 40);
        dataBuffer.writeDoubleBE(metrics.sessionDurationMs, 44);

        const hash = createHash("sha256").update(dataBuffer).digest();
        const fingerprintHash = new Uint8Array(hash);
        const confidence = this.computeConfidence(metrics);

        return {
            hash: fingerprintHash,
            metrics,
            confidence,
        };
    }

    /**
     * Generates a challenge nonce for the verification process.
     */
    generateChallengeNonce(): Uint8Array {
        return new Uint8Array(randomBytes(32));
    }

    /**
     * Solves a challenge by combining the nonce with the fingerprint hash.
     * Must match the on-chain compute_challenge_hash function.
     */
    solveChallenge(nonce: Uint8Array, fingerprintHash: Uint8Array): Uint8Array {
        const result = new Uint8Array(32);

        for (let i = 0; i < 32; i++) {
            result[i] = nonce[i] ^ fingerprintHash[i];
            result[i] = (result[i] + nonce[(i + 7) % 32]) & 0xff;
            result[i] ^= fingerprintHash[(i + 13) % 32];
        }

        for (let round = 0; round < 4; round++) {
            for (let i = 0; i < 32; i++) {
                const prev = result[(i + 31) % 32];
                const next = result[(i + 1) % 32];
                result[i] = (result[i] + ((prev * next) & 0xff) + round) & 0xff;
            }
        }

        return result;
    }

    /**
     * Returns whether enough data has been collected for verification.
     */
    isReadyForVerification(): boolean {
        const sessionDuration = Date.now() - this.sessionStartTime;
        return (
            this.events.length >= this.minEventsRequired &&
            sessionDuration >= this.minSessionDurationMs
        );
    }

    /**
     * Returns the number of events currently collected.
     */
    getEventCount(): number {
        return this.events.length;
    }

    /**
     * Resets all collected behavioral data.
     */
    reset(): void {
        this.events = [];
        this.sessionStartTime = Date.now();
    }

    // -- Private computational methods --

    private computeVariance(values: number[]): number {
        if (values.length < 2) return 0;
        const mean = values.reduce((a, b) => a + b, 0) / values.length;
        const squaredDiffs = values.map((v) => (v - mean) ** 2);
        return squaredDiffs.reduce((a, b) => a + b, 0) / (values.length - 1);
    }

    private computeEntropy(values: number[]): number {
        if (values.length < 2) return 0;

        const binCount = 20;
        const min = Math.min(...values);
        const max = Math.max(...values);
        const range = max - min || 1;
        const bins = new Array(binCount).fill(0);

        for (const value of values) {
            const binIndex = Math.min(
                Math.floor(((value - min) / range) * binCount),
                binCount - 1
            );
            bins[binIndex]++;
        }

        let entropy = 0;
        for (const count of bins) {
            if (count > 0) {
                const p = count / values.length;
                entropy -= p * Math.log2(p);
            }
        }

        return entropy;
    }

    private computeScrollPattern(scrollEvents: BehavioralEvent[]): number {
        if (scrollEvents.length < 3) return 0;

        let directionChanges = 0;
        let prevDirection = 0;

        for (const event of scrollEvents) {
            const direction = event.data.deltaY > 0 ? 1 : -1;
            if (prevDirection !== 0 && direction !== prevDirection) {
                directionChanges++;
            }
            prevDirection = direction;
        }

        const changeRatio = directionChanges / scrollEvents.length;
        const intensities = scrollEvents.map((e) => e.data.intensity);
        const intensityVariance = this.computeVariance(intensities);

        return changeRatio * 50 + Math.min(intensityVariance / 100, 50);
    }

    private computeIdlePattern(
        idleEvents: BehavioralEvent[],
        sessionDurationMs: number
    ): number {
        if (idleEvents.length === 0) return 100;

        const totalIdleTime = idleEvents.reduce((sum, e) => sum + e.data.duration, 0);
        const idleRatio = totalIdleTime / sessionDurationMs;

        const idleDurations = idleEvents.map((e) => e.data.duration);
        const durationVariance = this.computeVariance(idleDurations);

        const baseScore = (1 - idleRatio) * 70;
        const varianceBonus = Math.min(durationVariance / 10000, 30);

        return baseScore + varianceBonus;
    }

    private computeConfidence(metrics: BehavioralMetrics): number {
        let score = 0;

        if (metrics.totalEvents >= 100) score += 20;
        else if (metrics.totalEvents >= 50) score += 10;

        if (metrics.sessionDurationMs >= 30000) score += 20;
        else if (metrics.sessionDurationMs >= 10000) score += 10;

        if (metrics.keystrokeTimingVariance > 1000) score += 15;
        if (metrics.mouseMovementEntropy > 2.0) score += 15;
        if (metrics.scrollPatternScore > 30) score += 10;
        if (metrics.focusSwitchFrequency > 0.05 && metrics.focusSwitchFrequency < 2.0) score += 10;
        if (metrics.idlePatternScore > 50) score += 10;

        return Math.min(score, 100);
    }

    private getLastEventOfType(type: string): BehavioralEvent | undefined {
        for (let i = this.events.length - 1; i >= 0; i--) {
            if (this.events[i].type === type) return this.events[i];
        }
        return undefined;
    }
}
