import Anthropic from '@anthropic-ai/sdk';
import * as vscode from 'vscode';

const TIMEOUT_MS = 90_000;

export class LLMService {
  private client: Anthropic | null = null;

  constructor(private readonly context: vscode.ExtensionContext) {}

  private async getClient(): Promise<Anthropic> {
    if (this.client) { return this.client; }
    const key = await this.context.secrets.get('sdlc.apiKey');
    if (!key) {
      throw Object.assign(new Error('No API key configured. Run "SDLC: Set API Key".'), { code: 'unauthorized' });
    }
    this.client = new Anthropic({ apiKey: key });
    return this.client;
  }

  invalidateClient(): void {
    this.client = null;
  }

  async stream(
    messages: { role: 'user' | 'assistant'; content: string }[],
    onChunk: (text: string) => void,
    signal?: AbortSignal,
  ): Promise<string> {
    const model = vscode.workspace.getConfiguration('sdlcAgent').get<string>('model', 'claude-sonnet-4-6');

    const systemMsg = messages[0]?.role === 'user' ? undefined : messages[0];
    const userMessages = systemMsg ? messages.slice(1) : messages;

    return this.withRetry(async () => {
      const client = await this.getClient();

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
      const combinedSignal = signal
        ? anyAbort([signal, controller.signal])
        : controller.signal;

      try {
        const stream = await client.messages.stream(
          {
            model,
            max_tokens: 8192,
            ...(systemMsg ? { system: systemMsg.content } : {}),
            messages: userMessages as Anthropic.MessageParam[],
          },
          { signal: combinedSignal },
        );

        let fullText = '';
        for await (const event of stream) {
          if (signal?.aborted) { break; }
          if (
            event.type === 'content_block_delta' &&
            event.delta.type === 'text_delta'
          ) {
            onChunk(event.delta.text);
            fullText += event.delta.text;
          }
        }
        return fullText;
      } finally {
        clearTimeout(timeout);
      }
    }, signal);
  }

  private async withRetry<T>(
    fn: () => Promise<T>,
    signal?: AbortSignal,
    attempt = 0,
  ): Promise<T> {
    try {
      return await fn();
    } catch (err: unknown) {
      if (signal?.aborted) { throw err; }

      const e = err as { status?: number; message?: string; name?: string; code?: string };

      if (e.status === 401 || e.code === 'unauthorized') {
        this.invalidateClient();
        throw Object.assign(new Error(e.message ?? 'Unauthorized'), { code: 'unauthorized' });
      }

      if (e.status === 429 && attempt < 2) {
        const retryAfter = 5000 * (attempt + 1);
        await sleep(retryAfter);
        return this.withRetry(fn, signal, attempt + 1);
      }

      if ((e.name === 'AbortError' || e.name === 'TimeoutError') && attempt === 0) {
        throw Object.assign(new Error('Request timed out'), { code: 'timeout' });
      }

      if (attempt < 2 && !e.status) {
        await sleep(1000 * Math.pow(2, attempt));
        return this.withRetry(fn, signal, attempt + 1);
      }

      throw Object.assign(new Error(e.message ?? 'LLM error'), { code: 'network' });
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function anyAbort(signals: AbortSignal[]): AbortSignal {
  const ctrl = new AbortController();
  for (const s of signals) {
    if (s.aborted) { ctrl.abort(); break; }
    s.addEventListener('abort', () => ctrl.abort(), { once: true });
  }
  return ctrl.signal;
}
