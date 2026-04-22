import express from "express";
import { agentKeysRouter } from "./routes/agentKeys.js";
import { executeRouter } from "./routes/execute.js";
import { githubTargetsRouter } from "./routes/githubTargets.js";
import { requestsRouter } from "./routes/requests.js";

export const app = express();

app.use(express.json());

app.use("/githubTargets", githubTargetsRouter);
app.use("/agentKeys", agentKeysRouter);
app.use("/execute", executeRouter);
app.use("/requests", requestsRouter);
