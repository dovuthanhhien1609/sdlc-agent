import Anthropic from '@anthropic-ai/sdk';
import AnthropicVertex from '@anthropic-ai/vertex-sdk';
import { VertexAI } from '@google-cloud/vertexai';
import * as vscode from 'vscode';

const TIMEOUT_MS = 90_000;

type Provider = 'anthropic' | 'vertex' | 'gemini';

export class LLMService {
  private anthropicClient: Anthropic | null = null;
  private vertexClient: AnthropicVertex | null = null;
  private geminiClient: VertexAI | null = null;
  private activeProvider: Provider | null = null;

  constructor(private readonly context: vscode.ExtensionContext) {}

  invalidateClient(): void {
    this.anthropicClient = null;
    this.vertexClient = null;
    this.geminiClient = null;
    this.activeProvider = null;
  }

  async stream(
    messages: { role: 'user' | 'assistant'; content: string }[],
    onChunk: (text: string) => void,
    signal?: AbortSignal,
  ): Promise<string> {
    const cfg = vscode.workspace.getConfiguration('sdlcAgent');
    const provider = cfg.get<Provider>('provider', 'anthropic');

    if (provider === 'gemini') {
      return this.streamGemini(messages, onChunk, signal);
    }
    return this.streamAnthropic(messages, onChunk, signal, provider);
  }

  // --- Anthropic (direct or Vertex Claude) ---

  private async getAnthropicClient(provider: 'anthropic' | 'vertex'): Promise<{ client: Anthropic | AnthropicVertex; model: string }> {
    const cfg = vscode.workspace.getConfiguration('sdlcAgent');

    if (provider === 'vertex') {
      const projectId = cfg.get<string>('vertexProjectId', '');
      const region = cfg.get<string>('vertexRegion', 'us-east5');
      const model = cfg.get<string>('vertexModel', 'claude-sonnet-4-5@20251101');
      if (!projectId) {
        throw Object.assign(
          new Error('No Vertex project ID. Set "sdlcAgent.vertexProjectId" in VS Code settings.'),
          { code: 'unauthorized' },
        );
      }
      if (this.activeProvider !== 'vertex') {
        this.vertexClient = new AnthropicVertex({ projectId, region });
        this.activeProvider = 'vertex';
      }
      return { client: this.vertexClient!, model };
    }

    const key = await this.context.secrets.get('sdlc.apiKey');
    if (!key) {
      throw Object.assign(
        new Error('No API key configured. Run "SDLC: Set API Key".'),
        { code: 'unauthorized' },
      );
    }
    if (this.activeProvider !== 'anthropic') {
      this.anthropicClient = new Anthropic({ apiKey: key });
      this.activeProvider = 'anthropic';
    }
    const model = cfg.get<string>('model', 'claude-sonnet-4-6');
    return { client: this.anthropicClient!, model };
  }

  private async streamAnthropic(
    messages: { role: 'user' | 'assistant'; content: string }[],
    onChunk: (text: string) => void,
    signal: AbortSignal | undefined,
    provider: 'anthropic' | 'vertex',
  ): Promise<string> {
    const systemMsg = messages[0]?.role === 'user' ? undefined : messages[0];
    const userMessages = systemMsg ? messages.slice(1) : messages;

    return this.withRetry(async () => {
      const { client, model } = await this.getAnthropicClient(provider);

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
      const combined = signal ? anyAbort([signal, controller.signal]) : controller.signal;

      try {
        const stream = client.messages.stream(
          {
            model,
            max_tokens: 8192,
            ...(systemMsg ? { system: systemMsg.content } : {}),
            messages: userMessages as Anthropic.MessageParam[],
          },
          { signal: combined },
        );

        let fullText = '';
        for await (const event of stream) {
          if (signal?.aborted) { break; }
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
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

  // --- Gemini on Vertex AI ---

  private getGeminiClient(): { client: VertexAI; model: string } {
    const cfg = vscode.workspace.getConfiguration('sdlcAgent');
    const projectId = cfg.get<string>('vertexProjectId', '');
    const region = cfg.get<string>('vertexRegion', 'us-central1');
    const model = cfg.get<string>('geminiModel', 'gemini-2.5-flash');

    if (!projectId) {
      throw Object.assign(
        new Error('No project ID. Set "sdlcAgent.vertexProjectId" in VS Code settings.'),
        { code: 'unauthorized' },
      );
    }

    if (this.activeProvider !== 'gemini') {
      this.geminiClient = new VertexAI({ project: projectId, location: region });
      this.activeProvider = 'gemini';
    }
    return { client: this.geminiClient!, model };
  }

  private async streamGemini(
    messages: { role: 'user' | 'assistant'; content: string }[],
    onChunk: (text: string) => void,
    signal: AbortSignal | undefined,
  ): Promise<string> {
    return this.withRetry(async () => {
      const { client, model } = this.getGeminiClient();

      // Split off system message if present
      const systemMsg = messages[0]?.role === 'user' ? undefined : messages[0];
      const chatMessages = systemMsg ? messages.slice(1) : messages;

      // Convert Anthropic message format → Gemini format
      const contents = chatMessages.map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));

      const genModel = client.getGenerativeModel({
        model,
        ...(systemMsg ? { systemInstruction: systemMsg.content } : {}),
      });

      const result = await genModel.generateContentStream({ contents });

      let fullText = '';
      for await (const chunk of result.stream) {
        if (signal?.aborted) { break; }
        const text = chunk.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
        if (text) {
          onChunk(text);
          fullText += text;
        }
      }
      return fullText;
    }, signal);
  }

  // --- Retry logic ---

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
        await sleep(5000 * (attempt + 1));
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
