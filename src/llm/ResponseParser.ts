import { ZodSchema } from 'zod';

export type ParseResult<T> =
  | { ok: true; data: T }
  | { ok: false; raw: string; error: string };

export class ResponseParser {
  async parseWithRetry<T>(
    text: string,
    schema: ZodSchema<T>,
    retryFn: (correctionPrompt: string) => Promise<string>,
    maxRetries = 2,
  ): Promise<ParseResult<T>> {
    let current = text;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const result = this.tryParse(current, schema);
      if (result.ok) { return result; }

      if (attempt === maxRetries) {
        return { ok: false, raw: current, error: result.error };
      }

      const correction = this.buildCorrectionPrompt(result.error, result.errorType);
      current = await retryFn(correction);
    }

    return { ok: false, raw: current, error: 'Max retries exceeded' };
  }

  private tryParse<T>(
    text: string,
    schema: ZodSchema<T>,
  ): { ok: true; data: T } | { ok: false; error: string; errorType: 'json' | 'schema' } {
    const cleaned = this.extractJson(text);
    let parsed: unknown;
    try {
      parsed = JSON.parse(cleaned);
    } catch (e) {
      return { ok: false, error: (e as Error).message, errorType: 'json' };
    }

    const result = schema.safeParse(parsed);
    if (result.success) { return { ok: true, data: result.data }; }

    const issues = result.error.issues
      .map(i => `${i.path.join('.')}: ${i.message}`)
      .join('; ');
    return { ok: false, error: issues, errorType: 'schema' };
  }

  private extractJson(text: string): string {
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenced) { return fenced[1].trim(); }
    const start = text.search(/[{[]/);
    const end = Math.max(text.lastIndexOf('}'), text.lastIndexOf(']'));
    if (start !== -1 && end !== -1) { return text.slice(start, end + 1); }
    return text.trim();
  }

  private buildCorrectionPrompt(error: string, errorType: 'json' | 'schema'): string {
    if (errorType === 'json') {
      return `Your previous response was not valid JSON. Parse error: ${error}. Return ONLY valid JSON — no prose, no markdown fences.`;
    }
    return `Your previous response had schema validation errors: ${error}. Fix these fields and return the complete, corrected JSON object.`;
  }
}
