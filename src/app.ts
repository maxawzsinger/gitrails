import express from "express";
import { agentKeysRouter } from "./routes/agentKeys.js";
import { executeRouter } from "./routes/execute.js";
import { requestsRouter } from "./routes/requests.js";
import { usersRouter } from "./routes/users.js";

export const app = express();

app.use(express.json());

app.use("/users", usersRouter);
app.use("/agentKeys", agentKeysRouter);
app.use("/execute", executeRouter);
app.use("/requests", requestsRouter);
