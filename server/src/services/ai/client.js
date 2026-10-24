import { env } from "../../config/env.js";
import { ApiError } from "../../utils/apiError.js";

export function aiEnabled() {
  return Boolean(env.aiApiKey);
}

export async function chatCompletion({ messages, tools }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  let response;

  try {
    response = await fetch(`${env.aiBaseUrl}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.aiApiKey}`,
        "HTTP-Referer": "http://localhost:3000",
        "X-Title": "HCM Lite",
      },
      body: JSON.stringify({
        model: env.aiModel,
        messages,
        tools,
        tool_choice: "auto",
        temperature: 0.2,
        max_tokens: 1200,
      }),
    });
  } catch (error) {
    if (error.name === "AbortError") {
      throw new ApiError(504, "The AI assistant took too long to respond. Please try again.");
    }

    throw new ApiError(502, "The AI assistant is unavailable right now.");
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    await response.text().catch(() => "");
    throw new ApiError(502, "The AI assistant is unavailable right now.");
  }

  return response.json();
}
