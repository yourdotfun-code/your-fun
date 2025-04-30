import express from "express";
import cors from "cors";
import { chatRouter } from "./routes/chat";
import { verifyRouter } from "./routes/verify";
import { learnRouter } from "./routes/learn";
import { walletAuthMiddleware } from "./middleware/auth";

const app = express();
const PORT = process.env.PORT || 3100;

app.use(cors({
    origin: process.env.CORS_ORIGIN || "*",
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
}));

app.use(express.json({ limit: "2mb" }));

app.use((req, _res, next) => {
    const timestamp = new Date().toISOString();
    const method = req.method;
    const path = req.path;
    console.log(`[${timestamp}] ${method} ${path}`);
    next();
});

app.get("/health", (_req, res) => {
    res.json({
        status: "operational",
        service: "your.fun-api",
        version: "0.1.0",
        timestamp: Date.now(),
    });
});

app.use("/api/chat", walletAuthMiddleware, chatRouter);
app.use("/api/verify", verifyRouter);
app.use("/api/learn", walletAuthMiddleware, learnRouter);

app.use(
    (
        err: Error,
        _req: express.Request,
        res: express.Response,
        _next: express.NextFunction
    ) => {
        console.error(`[ERROR] ${err.message}`);
        console.error(err.stack);

        res.status(500).json({
            error: "internal_server_error",
            message: process.env.NODE_ENV === "production"
                ? "An unexpected error occurred"
                : err.message,
        });
    }
);

app.listen(PORT, () => {
    console.log(`your.fun API server running on port ${PORT}`);
    console.log(`Health check: http://localhost:${PORT}/health`);
});

export default app;
