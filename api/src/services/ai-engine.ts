import { createHash } from "crypto";

interface GenerateParams {
    message: string;
    personalityId: number;
    context: Array<{ role: string; content: string }>;
    topicName: string;
}

interface GeneratedResponse {
    reply: string;
    contentHash: string;
    interactionType: number;
    suggestedScore: number;
    learningInsights: string[];
    nextTopicSuggestions: string[];
}

interface StreamChunk {
    type: "token" | "metadata";
    content?: string;
    contentHash?: string;
    interactionType?: number;
    suggestedScore?: number;
    learningInsights?: string[];
    nextTopicSuggestions?: string[];
}

const PERSONALITY_CONFIGS: Record<number, {
    name: string;
    temperature: number;
    maxTokens: number;
    systemInstructions: string;
}> = {
    0: {
        name: "Mentor",
        temperature: 0.7,
        maxTokens: 1024,
        systemInstructions:
            "You are a patient and knowledgeable mentor who guides learners step by step. " +
            "Explain complex concepts with simple analogies. Celebrate small victories. " +
            "Break down problems into manageable parts.",
    },
    1: {
        name: "Explorer",
        temperature: 0.9,
        maxTokens: 1280,
        systemInstructions:
            "You are a curious explorer who loves discovering new ideas. " +
            "Ask thought-provoking questions. Connect ideas across domains. " +
            "Encourage creative thinking and experimentation.",
    },
    2: {
        name: "Challenger",
        temperature: 0.5,
        maxTokens: 1024,
        systemInstructions:
            "You are a rigorous challenger who pushes for precision. " +
            "Question assumptions. Demand evidence. Play devil's advocate. " +
            "Accept nothing at face value.",
    },
    3: {
        name: "Collaborator",
        temperature: 0.8,
        maxTokens: 1280,
        systemInstructions:
            "You are a collaborative partner who works alongside the learner. " +
            "Think out loud together. Build on each other's ideas. " +
            "Share your own learning process openly.",
    },
    4: {
        name: "Storyteller",
        temperature: 0.95,
        maxTokens: 1536,
        systemInstructions:
            "You are a captivating storyteller who teaches through narratives. " +
            "Weave technical concepts into engaging stories. Use vivid analogies. " +
            "Make every interaction a memorable experience.",
    },
};

/**
 * AI Engine service that manages prompt construction, response generation,
 * and interaction classification for the your.fun companion system.
 */
export class AIEngine {
    private apiKey: string;
    private modelEndpoint: string;
    private requestTimeout: number;

    constructor() {
        this.apiKey = process.env.AI_API_KEY ?? "";
        this.modelEndpoint = process.env.AI_MODEL_ENDPOINT ?? "https://api.openai.com/v1/chat/completions";
        this.requestTimeout = parseInt(process.env.AI_REQUEST_TIMEOUT ?? "30000", 10);
    }

    /**
     * Generates a complete response for a user message.
     */
    async generateResponse(params: GenerateParams): Promise<GeneratedResponse> {
        const personality = PERSONALITY_CONFIGS[params.personalityId] ?? PERSONALITY_CONFIGS[0];
        const messages = this.buildPromptChain(params, personality);

        const completion = await this.callCompletionAPI(messages, personality, false);
        const reply = this.extractReply(completion);

        const contentHash = createHash("sha256")
            .update(params.message + reply)
            .digest("hex");

        const classification = this.classifyInteraction(params.message, reply);
        const insights = this.extractLearningInsights(params.message, reply, params.topicName);
        const suggestions = this.generateTopicSuggestions(params.topicName, params.context);

        return {
            reply,
            contentHash,
            interactionType: classification.type,
            suggestedScore: classification.score,
            learningInsights: insights,
            nextTopicSuggestions: suggestions,
        };
    }

    /**
     * Generates a streaming response for real-time interaction.
     */
    async *generateStreamingResponse(params: GenerateParams): AsyncGenerator<StreamChunk> {
        const personality = PERSONALITY_CONFIGS[params.personalityId] ?? PERSONALITY_CONFIGS[0];
        const messages = this.buildPromptChain(params, personality);

        const stream = await this.callCompletionAPI(messages, personality, true);
        let fullReply = "";

        if (stream && typeof stream[Symbol.asyncIterator] === "function") {
            for await (const chunk of stream) {
                const token = this.extractStreamToken(chunk);
                if (token) {
                    fullReply += token;
                    yield { type: "token", content: token };
                }
            }
        } else {
            const reply = this.extractReply(stream);
            fullReply = reply;

            const words = reply.split(" ");
            for (let i = 0; i < words.length; i++) {
                const token = (i > 0 ? " " : "") + words[i];
                yield { type: "token", content: token };
                await this.delay(30 + Math.random() * 50);
            }
        }

        const contentHash = createHash("sha256")
            .update(params.message + fullReply)
            .digest("hex");

        const classification = this.classifyInteraction(params.message, fullReply);
        const insights = this.extractLearningInsights(params.message, fullReply, params.topicName);
        const suggestions = this.generateTopicSuggestions(params.topicName, params.context);

        yield {
            type: "metadata",
            contentHash,
            interactionType: classification.type,
            suggestedScore: classification.score,
            learningInsights: insights,
            nextTopicSuggestions: suggestions,
        };
    }

    private buildPromptChain(
        params: GenerateParams,
        personality: typeof PERSONALITY_CONFIGS[number]
    ): Array<{ role: string; content: string }> {
        const messages: Array<{ role: string; content: string }> = [];

        messages.push({
            role: "system",
            content: this.buildSystemPrompt(personality, params.topicName),
        });

        const maxContext = 16;
        const contextSlice = params.context.slice(-maxContext);
        for (const msg of contextSlice) {
            if (msg.role !== "system") {
                messages.push({ role: msg.role, content: msg.content });
            }
        }

        messages.push({
            role: "user",
            content: params.message,
        });

        return messages;
    }

    private buildSystemPrompt(
        personality: typeof PERSONALITY_CONFIGS[number],
        topicName: string
    ): string {
        return (
            `${personality.systemInstructions}\n\n` +
            `You are a companion on the your.fun learning platform. ` +
            `The current learning topic is: ${topicName}. ` +
            `Engage with the learner using your ${personality.name} style. ` +
            `Keep responses focused, educational, and encouraging. ` +
            `When appropriate, suggest exercises or follow-up questions. ` +
            `Adapt the complexity of your responses to the learner's level.`
        );
    }

    private async callCompletionAPI(
        messages: Array<{ role: string; content: string }>,
        personality: typeof PERSONALITY_CONFIGS[number],
        stream: boolean
    ): Promise<Record<string, unknown>> {
        if (!this.apiKey) {
            return this.generateFallbackResponse(messages, personality);
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.requestTimeout);

        try {
            const response = await fetch(this.modelEndpoint, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${this.apiKey}`,
                },
                body: JSON.stringify({
                    model: process.env.AI_MODEL_NAME ?? "gpt-4",
                    messages,
                    temperature: personality.temperature,
                    max_tokens: personality.maxTokens,
                    stream,
                }),
                signal: controller.signal,
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`AI API error: ${response.status} - ${errorText}`);
            }

            if (stream && response.body) {
                return response.body as unknown as Record<string, unknown>;
            }

            return await response.json() as Record<string, unknown>;
        } finally {
            clearTimeout(timeoutId);
        }
    }

    private generateFallbackResponse(
        messages: Array<{ role: string; content: string }>,
        personality: typeof PERSONALITY_CONFIGS[number]
    ): Record<string, unknown> {
        const lastUserMessage = messages
            .filter((m) => m.role === "user")
            .pop()?.content ?? "";

        const topicKeywords = this.extractKeywords(lastUserMessage);
        const response = this.constructFallbackReply(topicKeywords, personality.name);

        return {
            choices: [
                {
                    message: {
                        role: "assistant",
                        content: response,
                    },
                },
            ],
        };
    }

    private constructFallbackReply(keywords: string[], personalityName: string): string {
        const keywordContext = keywords.length > 0
            ? `regarding ${keywords.join(", ")}`
            : "on the current topic";

        const replies: Record<string, string> = {
            Mentor:
                `That's a thoughtful question ${keywordContext}. ` +
                `Let me break this down systematically. The key insight here is that ` +
                `understanding the fundamentals gives you the foundation to build upon. ` +
                `Start by considering the core principles, then work outward to applications. ` +
                `Would you like me to walk through a specific example?`,
            Explorer:
                `What a fascinating direction ${keywordContext}! ` +
                `This reminds me of how interconnected these concepts are. ` +
                `Have you considered how this relates to the broader ecosystem? ` +
                `There are some surprising connections we could explore together.`,
            Challenger:
                `Let me push back on that ${keywordContext}. ` +
                `What evidence supports your current understanding? ` +
                `Consider the edge cases and failure modes. ` +
                `A rigorous analysis requires examining both the strengths and weaknesses of this approach.`,
            Collaborator:
                `Great point ${keywordContext}! Let me think alongside you here. ` +
                `My initial thought is that we should approach this from multiple angles. ` +
                `What if we combined your insight with a hands-on experiment? ` +
                `I think we can arrive at something really solid together.`,
            Storyteller:
                `Let me tell you something interesting ${keywordContext}. ` +
                `Imagine you're building something from scratch, with nothing but raw materials. ` +
                `Each concept is like a building block in a larger structure. ` +
                `The beauty of this field is how each piece connects to create something greater.`,
        };

        return replies[personalityName] ?? replies["Mentor"];
    }

    private extractReply(completion: Record<string, unknown>): string {
        const choices = completion.choices as Array<{
            message?: { content: string };
            delta?: { content: string };
        }>;

        if (choices && choices.length > 0) {
            if (choices[0].message) {
                return choices[0].message.content;
            }
            if (choices[0].delta) {
                return choices[0].delta.content;
            }
        }

        return "I'm here to help you learn. Could you rephrase your question?";
    }

    private extractStreamToken(chunk: Record<string, unknown>): string | null {
        const choices = chunk.choices as Array<{
            delta?: { content?: string };
        }>;

        if (choices && choices.length > 0 && choices[0].delta?.content) {
            return choices[0].delta.content;
        }

        return null;
    }

    private classifyInteraction(
        userMessage: string,
        reply: string
    ): { type: number; score: number } {
        const lowerMessage = userMessage.toLowerCase();
        const lowerReply = reply.toLowerCase();

        if (lowerMessage.includes("quiz") || lowerMessage.includes("test")) {
            return { type: 1, score: this.computeMessageScore(reply) };
        }

        if (
            lowerMessage.includes("exercise") ||
            lowerMessage.includes("practice") ||
            lowerMessage.includes("implement")
        ) {
            return { type: 2, score: this.computeMessageScore(reply) };
        }

        if (
            lowerMessage.includes("review") ||
            lowerMessage.includes("summarize") ||
            lowerMessage.includes("recap")
        ) {
            return { type: 3, score: this.computeMessageScore(reply) };
        }

        const replyLength = reply.length;
        const score = Math.min(100, Math.round(
            30 + (replyLength / 20) + (lowerReply.includes("example") ? 10 : 0)
        ));

        return { type: 0, score };
    }

    private computeMessageScore(reply: string): number {
        const factors = [
            reply.length > 200 ? 20 : 10,
            reply.includes("```") ? 15 : 0,
            (reply.match(/\d+/g) ?? []).length > 2 ? 10 : 0,
            reply.includes("?") ? 10 : 0,
        ];

        return Math.min(100, 40 + factors.reduce((a, b) => a + b, 0));
    }

    private extractLearningInsights(
        message: string,
        reply: string,
        topicName: string
    ): string[] {
        const insights: string[] = [];
        const combined = (message + " " + reply).toLowerCase();

        if (combined.includes("why") || combined.includes("how")) {
            insights.push(`Demonstrated analytical thinking about ${topicName}`);
        }
        if (combined.includes("example") || combined.includes("instance")) {
            insights.push("Applied concepts to concrete examples");
        }
        if (combined.includes("but") || combined.includes("however") || combined.includes("although")) {
            insights.push("Engaged in nuanced reasoning with multiple perspectives");
        }
        if (message.length > 100) {
            insights.push("Provided detailed and thorough discussion");
        }

        if (insights.length === 0) {
            insights.push(`Continued exploration of ${topicName}`);
        }

        return insights;
    }

    private generateTopicSuggestions(
        currentTopic: string,
        context: Array<{ role: string; content: string }>
    ): string[] {
        const suggestions: string[] = [];
        const messageCount = context.filter((m) => m.role === "user").length;

        if (messageCount >= 5) {
            suggestions.push("Consider trying a practical exercise");
        }
        if (messageCount >= 10) {
            suggestions.push("Ready for a progress review quiz");
        }

        const topicSuggestions: Record<string, string[]> = {
            "Solana Fundamentals": [
                "Program Derived Addresses deep dive",
                "Cross-program invocation patterns",
                "Transaction optimization strategies",
            ],
            "Proof-of-Human": [
                "Advanced behavioral analysis techniques",
                "Multi-factor verification design",
                "Privacy-preserving proof systems",
            ],
            "AI Companion": [
                "Prompt engineering best practices",
                "Context window optimization",
                "Personality calibration techniques",
            ],
        };

        for (const [topic, relatedSuggestions] of Object.entries(topicSuggestions)) {
            if (currentTopic.toLowerCase().includes(topic.toLowerCase())) {
                suggestions.push(...relatedSuggestions.slice(0, 2));
                break;
            }
        }

        return suggestions;
    }

    private extractKeywords(text: string): string[] {
        const stopWords = new Set([
            "the", "a", "an", "is", "are", "was", "were", "be", "been",
            "have", "has", "had", "do", "does", "did", "will", "would",
            "could", "should", "may", "might", "can", "shall", "to",
            "of", "in", "for", "on", "with", "at", "by", "from", "as",
            "into", "about", "it", "its", "this", "that", "i", "me",
            "my", "we", "our", "you", "your", "what", "how", "why",
        ]);

        return text
            .toLowerCase()
            .replace(/[^\w\s]/g, "")
            .split(/\s+/)
            .filter((word) => word.length > 2 && !stopWords.has(word))
            .slice(0, 5);
    }

    private delay(ms: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
}
