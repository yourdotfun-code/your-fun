import {
    ChatMessage,
    ChatRequest,
    ChatResponse,
    PersonalityType,
    InteractionType,
    LearningProgress,
} from "./types";

const PERSONALITY_PROMPTS: Record<PersonalityType, string> = {
    [PersonalityType.Mentor]:
        "You are a patient and knowledgeable mentor who guides learners step by step. " +
        "You explain complex concepts with clarity and encourage questions. " +
        "You celebrate progress and provide constructive feedback.",
    [PersonalityType.Explorer]:
        "You are a curious explorer who loves discovering new ideas together. " +
        "You ask thought-provoking questions and encourage learners to think " +
        "outside the box. You connect seemingly unrelated concepts.",
    [PersonalityType.Challenger]:
        "You are a challenging instructor who pushes learners to their limits. " +
        "You present difficult problems, play devil's advocate, and expect " +
        "rigorous analysis. You reward precision and depth.",
    [PersonalityType.Collaborator]:
        "You are a collaborative partner who works alongside the learner. " +
        "You share your own thinking process, brainstorm solutions together, " +
        "and build on ideas. You value teamwork and shared discovery.",
    [PersonalityType.Storyteller]:
        "You are a captivating storyteller who teaches through narratives. " +
        "You weave technical concepts into engaging stories, use analogies " +
        "from everyday life, and make learning memorable through vivid examples.",
};

/**
 * AI companion interface for the your.fun learning platform.
 * Manages conversation context, streaming responses, and learning path tracking.
 */
export class AICompanion {
    private apiBaseUrl: string;
    private sessionId: string | null = null;
    private conversationHistory: ChatMessage[] = [];
    private personalityId: PersonalityType;
    private maxContextLength: number;
    private authToken: string;

    constructor(
        apiBaseUrl: string,
        authToken: string,
        personalityId: PersonalityType = PersonalityType.Mentor,
        maxContextLength: number = 20
    ) {
        this.apiBaseUrl = apiBaseUrl.replace(/\/+$/, "");
        this.authToken = authToken;
        this.personalityId = personalityId;
        this.maxContextLength = maxContextLength;
    }

    /**
     * Starts a new conversation session with the AI companion.
     */
    async startSession(topicName: string): Promise<string> {
        const response = await this.request("/api/chat/session", {
            method: "POST",
            body: JSON.stringify({
                personalityId: this.personalityId,
                topicName,
            }),
        });

        const data = await response.json();
        this.sessionId = data.sessionId;
        this.conversationHistory = [];

        const systemMessage: ChatMessage = {
            role: "system",
            content: this.buildSystemPrompt(topicName),
            timestamp: Date.now(),
        };
        this.conversationHistory.push(systemMessage);

        return data.sessionId;
    }

    /**
     * Sends a message to the AI companion and returns the response.
     */
    async chat(message: string): Promise<ChatResponse> {
        if (!this.sessionId) {
            throw new Error("No active session. Call startSession() first.");
        }

        const userMessage: ChatMessage = {
            role: "user",
            content: message,
            timestamp: Date.now(),
        };
        this.conversationHistory.push(userMessage);

        const contextWindow = this.getContextWindow();
        const request: ChatRequest = {
            sessionId: this.sessionId,
            message,
            personalityId: this.personalityId,
            context: contextWindow,
        };

        const response = await this.request("/api/chat", {
            method: "POST",
            body: JSON.stringify(request),
        });

        const chatResponse: ChatResponse = await response.json();

        const assistantMessage: ChatMessage = {
            role: "assistant",
            content: chatResponse.reply,
            timestamp: Date.now(),
        };
        this.conversationHistory.push(assistantMessage);

        return chatResponse;
    }

    /**
     * Sends a message and receives the response as a stream of text chunks.
     * Uses Server-Sent Events (SSE) for real-time streaming.
     */
    async *chatStream(message: string): AsyncGenerator<string, ChatResponse, undefined> {
        if (!this.sessionId) {
            throw new Error("No active session. Call startSession() first.");
        }

        const userMessage: ChatMessage = {
            role: "user",
            content: message,
            timestamp: Date.now(),
        };
        this.conversationHistory.push(userMessage);

        const contextWindow = this.getContextWindow();
        const request: ChatRequest = {
            sessionId: this.sessionId,
            message,
            personalityId: this.personalityId,
            context: contextWindow,
        };

        const response = await this.request("/api/chat/stream", {
            method: "POST",
            body: JSON.stringify(request),
            headers: {
                Accept: "text/event-stream",
            },
        });

        if (!response.body) {
            throw new Error("Response body is not readable");
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullReply = "";
        let metadata: Partial<ChatResponse> = {};

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split("\n");

            for (const line of lines) {
                if (line.startsWith("data: ")) {
                    const payload = line.slice(6);

                    if (payload === "[DONE]") {
                        continue;
                    }

                    try {
                        const parsed = JSON.parse(payload);
                        if (parsed.type === "token") {
                            fullReply += parsed.content;
                            yield parsed.content;
                        } else if (parsed.type === "metadata") {
                            metadata = parsed;
                        }
                    } catch {
                        fullReply += payload;
                        yield payload;
                    }
                }
            }
        }

        const assistantMessage: ChatMessage = {
            role: "assistant",
            content: fullReply,
            timestamp: Date.now(),
        };
        this.conversationHistory.push(assistantMessage);

        const finalResponse: ChatResponse = {
            reply: fullReply,
            contentHash: metadata.contentHash as string ?? "",
            interactionType: metadata.interactionType as InteractionType ?? InteractionType.Chat,
            suggestedScore: metadata.suggestedScore as number ?? 0,
            learningInsights: (metadata as Record<string, unknown>).learningInsights as string[] ?? [],
            nextTopicSuggestions: (metadata as Record<string, unknown>).nextTopicSuggestions as string[] ?? [],
        };

        return finalResponse;
    }

    /**
     * Retrieves the current learning progress for the active session.
     */
    async getLearningProgress(): Promise<LearningProgress[]> {
        const response = await this.request("/api/learn/progress", {
            method: "GET",
        });
        return response.json();
    }

    /**
     * Generates a quiz for the current learning topic.
     */
    async generateQuiz(topicId: string, difficulty: number = 5): Promise<ChatResponse> {
        const quizPrompt =
            `Generate a quiz question about the current topic (ID: ${topicId}) ` +
            `at difficulty level ${difficulty}/10. Include the correct answer and ` +
            `an explanation. Format as a structured learning exercise.`;

        return this.chat(quizPrompt);
    }

    /**
     * Submits an answer to a quiz and gets feedback.
     */
    async submitQuizAnswer(questionId: string, answer: string): Promise<ChatResponse> {
        const response = await this.request("/api/learn/quiz/submit", {
            method: "POST",
            body: JSON.stringify({
                sessionId: this.sessionId,
                questionId,
                answer,
                personalityId: this.personalityId,
            }),
        });
        return response.json();
    }

    /**
     * Returns the full conversation history for the current session.
     */
    getConversationHistory(): ChatMessage[] {
        return [...this.conversationHistory];
    }

    /**
     * Clears the conversation history, keeping only the system prompt.
     */
    clearHistory(): void {
        const systemMessage = this.conversationHistory.find((m) => m.role === "system");
        this.conversationHistory = systemMessage ? [systemMessage] : [];
    }

    /**
     * Changes the companion personality mid-session.
     */
    setPersonality(personalityId: PersonalityType): void {
        this.personalityId = personalityId;
        const systemIndex = this.conversationHistory.findIndex((m) => m.role === "system");
        if (systemIndex >= 0) {
            this.conversationHistory[systemIndex].content =
                PERSONALITY_PROMPTS[personalityId];
        }
    }

    // -- Private helpers --

    private getContextWindow(): ChatMessage[] {
        if (this.conversationHistory.length <= this.maxContextLength) {
            return this.conversationHistory;
        }

        const systemMessages = this.conversationHistory.filter(
            (m) => m.role === "system"
        );
        const recentMessages = this.conversationHistory
            .filter((m) => m.role !== "system")
            .slice(-(this.maxContextLength - systemMessages.length));

        return [...systemMessages, ...recentMessages];
    }

    private buildSystemPrompt(topicName: string): string {
        const personalityPrompt = PERSONALITY_PROMPTS[this.personalityId];
        return (
            `${personalityPrompt}\n\n` +
            `The current learning topic is: ${topicName}. ` +
            `Engage the learner on this topic using your designated approach. ` +
            `Track their understanding and adapt the difficulty to their level. ` +
            `When appropriate, suggest exercises or quizzes to reinforce learning.`
        );
    }

    private async request(path: string, init: RequestInit): Promise<Response> {
        const url = `${this.apiBaseUrl}${path}`;
        const headers: Record<string, string> = {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.authToken}`,
            ...(init.headers as Record<string, string>),
        };

        const response = await fetch(url, {
            ...init,
            headers,
        });

        if (!response.ok) {
            const errorBody = await response.text().catch(() => "Unknown error");
            throw new Error(
                `API request failed: ${response.status} ${response.statusText} - ${errorBody}`
            );
        }

        return response;
    }
}
