import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/apiError.js";
import { env } from "../config/env.js";
import { aiEnabled, chatCompletion } from "../services/ai/client.js";
import { buildSystemPrompt } from "../services/ai/prompt.js";
import { TOOL_DEFINITIONS, executeTool, clean, validateToolArguments } from "../services/ai/executor.js";
import { getOrg } from "../services/orgService.js";
import { sanitizeForLlm } from "../utils/sanitize.js";
import AiLog from "../models/AiLog.js";
import { audit } from "../utils/audit.js";

const MAX_ROUNDS = 3;
const MAX_HISTORY = 10;

export const status = asyncHandler(async (req, res) => {
  res.json({ enabled: aiEnabled(), model: env.aiModel });
});

function parseHistory(input) {
  if (!Array.isArray(input) || input.length === 0 || input.length > MAX_HISTORY) {
    throw new ApiError(400, `messages must be an array of 1-${MAX_HISTORY} items.`);
  }

  return input.map((item) => {
    if (!item || !["user", "assistant"].includes(item.role) || typeof item.content !== "string" || !item.content.trim()) {
      throw new ApiError(400, "Each message needs a role (user or assistant) and non-empty content.");
    }

    return { role: item.role, content: sanitizeForLlm(item.content, 2000) };
  });
}

export const chat = asyncHandler(async (req, res) => {
  if (!aiEnabled()) {
    throw new ApiError(503, "The AI assistant is not configured. Set AI_API_KEY in the server environment.");
  }

  const history = parseHistory(req.body?.messages);

  if (history[history.length - 1].role !== "user") {
    throw new ApiError(400, "The last message must come from the user.");
  }

  const actor = req.user;
  const org = await getOrg();
  const messages = [{ role: "system", content: buildSystemPrompt({ actor, org }) }, ...history];
  const toolsUsed = [];
  let draft = null;

  let ok = false;

  try {
    for (let round = 0; round < MAX_ROUNDS; round += 1) {
      const completion = await chatCompletion({ messages, tools: TOOL_DEFINITIONS });
      const reply = completion?.choices?.[0]?.message;

      if (!reply) {
        throw new ApiError(502, "The AI assistant returned an unexpected response.");
      }

      if (Array.isArray(reply.tool_calls) && reply.tool_calls.length > 0) {
        messages.push({
          role: "assistant",
          content: reply.content ?? "",
          tool_calls: reply.tool_calls,
        });

        for (const call of reply.tool_calls) {
          if (call.type !== "function" || !call.function?.name) {
            continue;
          }

          let args = {};
          let parseError = false;

          try {
            args = JSON.parse(call.function.arguments || "{}");
          } catch {
            parseError = true;
          }

          const validation = parseError
            ? { valid: false, error: "Tool arguments must be valid JSON." }
            : validateToolArguments(call.function.name, args);
          const result = validation.valid
            ? await executeTool(actor, call.function.name, validation.value)
            : { error: validation.error };

          if (result?.draft) {
            draft = result.draft;
          }

          toolsUsed.push(call.function.name);
          messages.push({
            role: "tool",
            tool_call_id: String(call.id ?? ""),
            content: clean(result),
          });
        }

        continue;
      }

      const text = sanitizeForLlm(String(reply.content ?? ""), 4000);
      ok = true;
      return res.json({ reply: text || "I could not produce an answer for that.", draft, toolsUsed });
    }

    ok = true;
    return res.json({
      reply: "I could not finish that request. Please rephrase or try again.",
      draft,
      toolsUsed,
    });
  } finally {
    await logChat(actor, toolsUsed, ok);
  }
});

async function logChat(actor, toolsUsed, ok) {
  try {
    await AiLog.create({ userId: actor.id, role: actor.role, tools: toolsUsed, ok });
    await audit(actor, "ai.chat", "ai", actor.id, { tools: toolsUsed }, null);
  } catch (error) {
    console.error("ai log failed:", error.message);
  }
}
