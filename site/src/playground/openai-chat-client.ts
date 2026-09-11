/**
 * Minimal browser client for the OpenAI chat-completions API with streaming
 * and tool calls. The demo talks to the API directly from the page, so the key
 * never leaves the visitor's browser except for the request to the API itself.
 */

export interface ChatToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export type ChatMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: ChatToolCall[] }
  | { role: 'tool'; content: string; tool_call_id: string };

export interface ChatToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
    /** Strict schema mode: every property is required and no extra keys are allowed. */
    strict?: boolean;
  };
}

export interface OpenAIConnection {
  apiKey: string;
  model: string;
  baseUrl: string;
}

export interface StreamChatOptions {
  connection: OpenAIConnection;
  messages: readonly ChatMessage[];
  tools?: readonly ChatToolDefinition[];
  /** Passed through as `response_format`, for example a strict JSON schema. */
  responseFormat?: Record<string, unknown>;
  signal?: AbortSignal;
  /** Called with each text delta and the full text so far. */
  onText?: (delta: string, full: string) => void;
}

export interface StreamChatResult {
  content: string;
  toolCalls: ChatToolCall[];
  finishReason: string | null;
}

export const DEFAULT_OPENAI_BASE_URL = 'https://api.openai.com/v1';
export const DEFAULT_OPENAI_MODEL = 'gpt-4o-mini';

async function readErrorDetail(response: Response): Promise<string> {
  try {
    const text = await response.text();
    try {
      const json = JSON.parse(text) as { error?: { message?: string } };
      return json.error?.message ?? text;
    } catch {
      return text;
    }
  } catch {
    return '';
  }
}

export async function streamChatCompletion(options: StreamChatOptions): Promise<StreamChatResult> {
  const { connection, messages, tools, responseFormat, signal, onText } = options;
  const url = `${connection.baseUrl.replace(/\/+$/, '')}/chat/completions`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${connection.apiKey}`,
    },
    body: JSON.stringify({
      model: connection.model,
      messages,
      stream: true,
      ...(tools && tools.length > 0 ? { tools, tool_choice: 'auto' } : {}),
      ...(responseFormat ? { response_format: responseFormat } : {}),
    }),
    signal,
  });

  if (!response.ok) {
    const detail = await readErrorDetail(response);
    throw new Error(`The API request failed (${response.status})${detail ? `: ${detail}` : '.'}`);
  }
  if (!response.body) throw new Error('The API response had no body to stream.');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const toolCalls = new Map<number, ChatToolCall>();
  let buffer = '';
  let content = '';
  let finishReason: string | null = null;

  const consume = (payload: string) => {
    let json: {
      choices?: Array<{
        finish_reason?: string | null;
        delta?: {
          content?: string | null;
          tool_calls?: Array<{ index?: number; id?: string; function?: { name?: string; arguments?: string } }>;
        };
      }>;
    };
    try {
      json = JSON.parse(payload);
    } catch {
      return;
    }
    const choice = json.choices?.[0];
    if (!choice) return;
    const delta = choice.delta ?? {};
    if (typeof delta.content === 'string' && delta.content.length > 0) {
      content += delta.content;
      onText?.(delta.content, content);
    }
    for (const call of delta.tool_calls ?? []) {
      const index = call.index ?? 0;
      const current = toolCalls.get(index) ?? { id: '', type: 'function' as const, function: { name: '', arguments: '' } };
      if (call.id) current.id = call.id;
      if (call.function?.name) current.function.name += call.function.name;
      if (call.function?.arguments) current.function.arguments += call.function.arguments;
      toolCalls.set(index, current);
    }
    if (choice.finish_reason) finishReason = choice.finish_reason;
  };

  const consumeLines = () => {
    let boundary = buffer.indexOf('\n');
    while (boundary !== -1) {
      const line = buffer.slice(0, boundary).trim();
      buffer = buffer.slice(boundary + 1);
      if (line.startsWith('data:')) {
        const payload = line.slice(5).trim();
        if (payload && payload !== '[DONE]') consume(payload);
      }
      boundary = buffer.indexOf('\n');
    }
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    consumeLines();
  }
  buffer += decoder.decode();
  buffer += '\n';
  consumeLines();

  return {
    content,
    toolCalls: [...toolCalls.entries()].sort((a, b) => a[0] - b[0]).map(([, call]) => call),
    finishReason,
  };
}
