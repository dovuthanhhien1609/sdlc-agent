import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export class TechStackDetector {
  async detect(): Promise<string> {
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!root) { return ''; }

    const parts: string[] = [];

    const pkg = this.readJson(path.join(root, 'package.json'));
    if (pkg) {
      const deps = {
        ...(pkg.dependencies as Record<string, unknown> ?? {}),
        ...(pkg.devDependencies as Record<string, unknown> ?? {}),
      };
      if (deps['typescript']) { parts.push('TypeScript'); }
      if (deps['react']) { parts.push('React'); }
      if (deps['next']) { parts.push('Next.js'); }
      if (deps['express']) { parts.push('Express'); }
      if (deps['fastify']) { parts.push('Fastify'); }
      if (deps['prisma'] || deps['@prisma/client']) { parts.push('Prisma'); }
      if (deps['drizzle-orm']) { parts.push('Drizzle ORM'); }
      if (deps['mongoose']) { parts.push('MongoDB/Mongoose'); }
      if (deps['pg'] || deps['postgres']) { parts.push('PostgreSQL'); }
      if (deps['redis'] || deps['ioredis']) { parts.push('Redis'); }
      if (!parts.includes('TypeScript')) { parts.push('Node.js / JavaScript'); }
    }

    if (this.exists(root, 'go.mod')) { parts.push('Go'); }
    if (this.exists(root, 'pom.xml')) { parts.push('Java / Maven'); }
    if (this.exists(root, 'build.gradle') || this.exists(root, 'build.gradle.kts')) {
      parts.push('Java or Kotlin / Gradle');
    }
    if (this.exists(root, 'Cargo.toml')) { parts.push('Rust'); }
    if (this.exists(root, 'requirements.txt') || this.exists(root, 'pyproject.toml')) {
      parts.push('Python');
    }

    return parts.length ? parts.join(', ') : 'Unknown stack';
  }

  private readJson(filePath: string): Record<string, unknown> | null {
    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch { return null; }
  }

  private exists(root: string, file: string): boolean {
    return fs.existsSync(path.join(root, file));
  }
}
