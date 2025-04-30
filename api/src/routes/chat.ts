import { Router, Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { AIEngine } from "../services/ai-engine";
import { AuthenticatedRequest } from "../middleware/auth";

export const chatRouter = Router();
const aiEngine = new AIEngine();

const activeSessions = new Map<string, {
    wallet: string;
    personalityId: number;
    topicName: string;
    createdAt: number;
    messageCount: number;
}>();

/**
 * POST /api/chat/session
 * Creates a new AI companion chat session.
 */
chatRouter.post("/session", (req: AuthenticatedRequest, res: Response) => {
    const { personalityId, topicName } = req.body;

    if (personalityId === undefined || !topicName) {
        res.status(400).json({
            error: "missing_parameters",
            message: "personalityId and topicName are required",
        });
        return;
    }

    const sessionId = uuidv4();
    activeSessions.set(sessionId, {
        wallet: req.wallet!,
        personalityId,
        topicName,
        createdAt: Date.now(),
        messageCount: 0,
    });

    res.json({
        sessionId,
        personalityId,
        topicName,
        createdAt: Date.now(),
    });
});

/**
 * POST /api/chat
 * Sends a message to the AI companion and receives a complete response.
 */
chatRouter.post("/", async (req: AuthenticatedRequest, res: Response) => {
    const { sessionId, message, personalityId, context } = req.body;

    if (!sessionId || !message) {
        res.status(400).json({
            error: "missing_parameters",
            message: "sessionId and message are required",
        });
        return;
    }

    const session = activeSessions.get(sessionId);
    if (!session) {
        res.status(404).json({
            error: "session_not_found",
            message: "The specified session does not exist or has expired",
        });
        return;
    }

    if (session.wallet !== req.wallet) {
        res.status(403).json({
            error: "unauthorized",
            message: "You are not the owner of this session",
        });
        return;
    }

    try {
        const response = await aiEngine.generateResponse({
            message,
            personalityId: personalityId ?? session.personalityId,
            context: context ?? [],
            topicName: session.topicName,
        });

        session.messageCount++;

        res.json(response);
    } catch (err) {
        const error = err as Error;
        res.status(500).json({
            error: "generation_failed",
            message: error.message,
        });
    }
});

/**
 * POST /api/chat/stream
 * Sends a message and streams the response via Server-Sent Events.
 */
chatRouter.post("/stream", async (req: AuthenticatedRequest, res: Response) => {
    const { sessionId, message, personalityId, context } = req.body;

    if (!sessionId || !message) {
        res.status(400).json({
            error: "missing_parameters",
            message: "sessionId and message are required",
        });
        return;
    }

    const session = activeSessions.get(sessionId);
    if (!session) {
        res.status(404).json({
            error: "session_not_found",
            message: "The specified session does not exist or has expired",
        });
        return;
    }

    if (session.wallet !== req.wallet) {
        res.status(403).json({
            error: "unauthorized",
            message: "You are not the owner of this session",
        });
        return;
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    try {
        const stream = aiEngine.generateStreamingResponse({
            message,
            personalityId: personalityId ?? session.personalityId,
            context: context ?? [],
            topicName: session.topicName,
        });

        for await (const chunk of stream) {
            if (chunk.type === "token") {
                res.write(`data: ${JSON.stringify(chunk)}\n\n`);
            } else if (chunk.type === "metadata") {
                res.write(`data: ${JSON.stringify(chunk)}\n\n`);
            }
        }

        res.write("data: [DONE]\n\n");
        session.messageCount++;
        res.end();
    } catch (err) {
        const error = err as Error;
        res.write(`data: ${JSON.stringify({ type: "error", message: error.message })}\n\n`);
        res.end();
    }
});

/**
 * DELETE /api/chat/session/:sessionId
 * Closes and removes an active chat session.
 */
chatRouter.delete("/session/:sessionId", (req: AuthenticatedRequest, res: Response) => {
    const { sessionId } = req.params;
    const session = activeSessions.get(sessionId);

    if (!session) {
        res.status(404).json({
            error: "session_not_found",
            message: "The specified session does not exist",
        });
        return;
    }

    if (session.wallet !== req.wallet) {
        res.status(403).json({
            error: "unauthorized",
            message: "You are not the owner of this session",
        });
        return;
    }

    activeSessions.delete(sessionId);
    res.json({
        message: "Session closed successfully",
        totalMessages: session.messageCount,
    });
});
