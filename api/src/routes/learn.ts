import { Router, Response } from "express";
import { AuthenticatedRequest } from "../middleware/auth";
import { createHash } from "crypto";

export const learnRouter = Router();

interface LearningTopic {
    id: string;
    name: string;
    description: string;
    lessons: Lesson[];
    prerequisites: string[];
    difficulty: number;
}

interface Lesson {
    id: string;
    title: string;
    content: string;
    exerciseCount: number;
    estimatedMinutes: number;
}

interface UserProgress {
    wallet: string;
    topicId: string;
    completedLessons: Set<string>;
    scores: Map<string, number>;
    streak: number;
    lastActivityAt: number;
}

const topics: Map<string, LearningTopic> = new Map();
const userProgress: Map<string, Map<string, UserProgress>> = new Map();

initializeDefaultTopics();

/**
 * GET /api/learn/topics
 * Lists all available learning topics.
 */
learnRouter.get("/topics", (_req: AuthenticatedRequest, res: Response) => {
    const topicList = Array.from(topics.values()).map((t) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        lessonCount: t.lessons.length,
        difficulty: t.difficulty,
        prerequisites: t.prerequisites,
    }));

    res.json({ topics: topicList });
});

/**
 * GET /api/learn/topics/:topicId
 * Returns detailed information about a specific topic.
 */
learnRouter.get("/topics/:topicId", (req: AuthenticatedRequest, res: Response) => {
    const topic = topics.get(req.params.topicId);

    if (!topic) {
        res.status(404).json({
            error: "topic_not_found",
            message: "The requested learning topic does not exist",
        });
        return;
    }

    res.json(topic);
});

/**
 * GET /api/learn/progress
 * Returns the authenticated user's learning progress across all topics.
 */
learnRouter.get("/progress", (req: AuthenticatedRequest, res: Response) => {
    const wallet = req.wallet!;
    const walletProgress = userProgress.get(wallet);

    if (!walletProgress) {
        res.json({ progress: [] });
        return;
    }

    const progressList = Array.from(walletProgress.values()).map((p) => {
        const topic = topics.get(p.topicId);
        const totalLessons = topic?.lessons.length ?? 0;
        const completedCount = p.completedLessons.size;
        const avgScore = p.scores.size > 0
            ? Array.from(p.scores.values()).reduce((a, b) => a + b, 0) / p.scores.size
            : 0;

        return {
            topicId: p.topicId,
            topicName: topic?.name ?? "Unknown",
            completedLessons: completedCount,
            totalLessons,
            currentScore: Math.round(avgScore),
            streak: p.streak,
            lastActivityAt: p.lastActivityAt,
            progressPercent: totalLessons > 0 ? Math.round((completedCount / totalLessons) * 100) : 0,
        };
    });

    res.json({ progress: progressList });
});

/**
 * POST /api/learn/complete
 * Marks a lesson as completed and updates the user's score.
 */
learnRouter.post("/complete", (req: AuthenticatedRequest, res: Response) => {
    const { topicId, lessonId, score } = req.body;
    const wallet = req.wallet!;

    if (!topicId || !lessonId || score === undefined) {
        res.status(400).json({
            error: "missing_parameters",
            message: "topicId, lessonId, and score are required",
        });
        return;
    }

    const topic = topics.get(topicId);
    if (!topic) {
        res.status(404).json({
            error: "topic_not_found",
            message: "The requested learning topic does not exist",
        });
        return;
    }

    const lesson = topic.lessons.find((l) => l.id === lessonId);
    if (!lesson) {
        res.status(404).json({
            error: "lesson_not_found",
            message: "The requested lesson does not exist in this topic",
        });
        return;
    }

    if (!userProgress.has(wallet)) {
        userProgress.set(wallet, new Map());
    }

    const walletProgress = userProgress.get(wallet)!;

    if (!walletProgress.has(topicId)) {
        walletProgress.set(topicId, {
            wallet,
            topicId,
            completedLessons: new Set(),
            scores: new Map(),
            streak: 0,
            lastActivityAt: Date.now(),
        });
    }

    const progress = walletProgress.get(topicId)!;
    const isNewCompletion = !progress.completedLessons.has(lessonId);

    progress.completedLessons.add(lessonId);
    progress.scores.set(lessonId, Math.min(100, Math.max(0, score)));
    progress.lastActivityAt = Date.now();

    if (isNewCompletion) {
        const lastDay = new Date(progress.lastActivityAt).toDateString();
        const today = new Date().toDateString();
        if (lastDay === today || isConsecutiveDay(progress.lastActivityAt)) {
            progress.streak++;
        } else {
            progress.streak = 1;
        }
    }

    const contentHash = createHash("sha256")
        .update(`${wallet}:${topicId}:${lessonId}:${score}:${Date.now()}`)
        .digest("hex");

    res.json({
        updated: true,
        lessonId,
        score: progress.scores.get(lessonId),
        completedLessons: progress.completedLessons.size,
        totalLessons: topic.lessons.length,
        streak: progress.streak,
        contentHash,
        isNewCompletion,
    });
});

/**
 * POST /api/learn/quiz/submit
 * Processes a quiz answer submission and provides feedback.
 */
learnRouter.post("/quiz/submit", (req: AuthenticatedRequest, res: Response) => {
    const { sessionId, questionId, answer, personalityId } = req.body;

    if (!sessionId || !questionId || !answer) {
        res.status(400).json({
            error: "missing_parameters",
            message: "sessionId, questionId, and answer are required",
        });
        return;
    }

    const correctnessScore = evaluateAnswer(answer);
    const feedback = generateFeedback(correctnessScore, personalityId ?? 0);

    const contentHash = createHash("sha256")
        .update(`quiz:${questionId}:${answer}:${Date.now()}`)
        .digest("hex");

    res.json({
        reply: feedback,
        contentHash,
        interactionType: 1,
        suggestedScore: correctnessScore,
        learningInsights: [
            "Response demonstrates understanding of core concepts",
            "Consider exploring edge cases for deeper mastery",
        ],
        nextTopicSuggestions: [],
    });
});

function evaluateAnswer(answer: string): number {
    const length = answer.length;
    const hasStructure = answer.includes(".") || answer.includes(",");
    const hasDepth = length > 100;

    let score = 30;
    if (length > 20) score += 15;
    if (length > 50) score += 15;
    if (hasStructure) score += 10;
    if (hasDepth) score += 15;
    if (length > 200) score += 15;

    return Math.min(100, score);
}

function generateFeedback(score: number, personalityId: number): string {
    const feedbackTemplates: Record<number, Record<string, string>> = {
        0: {
            high: "Excellent work. Your understanding of this concept is solid. " +
                "Let me suggest we explore some advanced applications next.",
            medium: "Good effort. You've grasped the fundamentals, but there are " +
                "some nuances worth exploring further. Let's work through them together.",
            low: "I can see you're working through this. Let's take a step back " +
                "and build a stronger foundation before moving forward.",
        },
        1: {
            high: "Fascinating insight! I love how you connected those ideas. " +
                "What if we explored how this relates to broader patterns?",
            medium: "Interesting approach! There's more depth to uncover here. " +
                "What questions does your answer raise for you?",
            low: "Every discovery starts somewhere. Let's explore this concept " +
                "from a different angle and see what we find.",
        },
        2: {
            high: "Strong analysis. Now, can you defend that position against " +
                "a counterargument? Think about the edge cases.",
            medium: "Acceptable, but I expect more rigor. What assumptions are " +
                "you making? Challenge each one systematically.",
            low: "Not quite there yet. Let's identify exactly where the reasoning " +
                "breaks down and rebuild from first principles.",
        },
    };

    const personality = feedbackTemplates[personalityId] ?? feedbackTemplates[0];
    const level = score >= 80 ? "high" : score >= 50 ? "medium" : "low";

    return personality[level];
}

function isConsecutiveDay(lastTimestamp: number): boolean {
    const lastDate = new Date(lastTimestamp);
    const today = new Date();
    const diffMs = today.getTime() - lastDate.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    return diffDays <= 1;
}

function initializeDefaultTopics(): void {
    topics.set("solana-fundamentals", {
        id: "solana-fundamentals",
        name: "Solana Fundamentals",
        description: "Core concepts of the Solana blockchain: accounts, programs, transactions, and the runtime.",
        difficulty: 3,
        prerequisites: [],
        lessons: [
            {
                id: "sol-001",
                title: "Accounts and the Account Model",
                content: "Understanding Solana's account-based architecture and how data is stored on-chain.",
                exerciseCount: 3,
                estimatedMinutes: 15,
            },
            {
                id: "sol-002",
                title: "Programs and Instructions",
                content: "How Solana programs process instructions and manage state transitions.",
                exerciseCount: 4,
                estimatedMinutes: 20,
            },
            {
                id: "sol-003",
                title: "Transactions and Signatures",
                content: "Building, signing, and sending transactions on Solana.",
                exerciseCount: 3,
                estimatedMinutes: 15,
            },
            {
                id: "sol-004",
                title: "Program Derived Addresses",
                content: "Deterministic address generation and cross-program invocation patterns.",
                exerciseCount: 5,
                estimatedMinutes: 25,
            },
        ],
    });

    topics.set("proof-of-human", {
        id: "proof-of-human",
        name: "Proof-of-Human Verification",
        description: "Understanding behavioral biometrics, challenge-response protocols, and human verification on-chain.",
        difficulty: 5,
        prerequisites: ["solana-fundamentals"],
        lessons: [
            {
                id: "poh-001",
                title: "Behavioral Biometrics",
                content: "Capturing and analyzing human interaction patterns for identity verification.",
                exerciseCount: 3,
                estimatedMinutes: 20,
            },
            {
                id: "poh-002",
                title: "Challenge-Response Protocols",
                content: "Designing secure challenge mechanisms that distinguish humans from bots.",
                exerciseCount: 4,
                estimatedMinutes: 25,
            },
            {
                id: "poh-003",
                title: "On-Chain Verification",
                content: "Recording and validating human proofs using Solana programs.",
                exerciseCount: 3,
                estimatedMinutes: 20,
            },
        ],
    });

    topics.set("ai-companion-dev", {
        id: "ai-companion-dev",
        name: "AI Companion Development",
        description: "Building conversational AI companions with personality systems, context management, and learning adaptation.",
        difficulty: 6,
        prerequisites: ["solana-fundamentals"],
        lessons: [
            {
                id: "ai-001",
                title: "Personality Architecture",
                content: "Designing personality systems that influence AI behavior and communication style.",
                exerciseCount: 3,
                estimatedMinutes: 20,
            },
            {
                id: "ai-002",
                title: "Context Management",
                content: "Efficient context windowing and conversation history management for AI sessions.",
                exerciseCount: 4,
                estimatedMinutes: 25,
            },
            {
                id: "ai-003",
                title: "Adaptive Learning",
                content: "Building AI systems that adapt to individual learner progress and preferences.",
                exerciseCount: 5,
                estimatedMinutes: 30,
            },
            {
                id: "ai-004",
                title: "Integration with On-Chain Records",
                content: "Connecting AI interactions with Solana-based progress tracking and verification.",
                exerciseCount: 3,
                estimatedMinutes: 20,
            },
        ],
    });
}
