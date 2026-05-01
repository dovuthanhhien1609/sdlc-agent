import * as vscode from 'vscode';
import * as crypto from 'crypto';
import { ExtensionMessage, WebViewCommand } from '../shared/messages';
import { StateStore } from '../session/StateStore';

export class WebViewPanelManager {
  private panel: vscode.WebviewPanel | undefined;
  private activeSessionId: string | undefined;
  private cleanup: (() => void)[] = [];

  // Resolved after the panel + session manager are wired up
  private commandHandler: ((cmd: WebViewCommand, sessionId: string) => Promise<void>) | undefined;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly store: StateStore,
  ) {
    const offChange = store.onChange(session => {
      if (session.id === this.activeSessionId) {
        this.postMessage({ type: 'SESSION_UPDATE', session });
      }
    });
    const offDelete = store.onDelete(id => {
      if (id === this.activeSessionId) {
        this.activeSessionId = undefined;
        this.postMessage({ type: 'SESSION_DELETED' });
      }
    });
    this.cleanup.push(offChange, offDelete);
  }

  setCommandHandler(
    handler: (cmd: WebViewCommand, sessionId: string) => Promise<void>,
  ): void {
    this.commandHandler = handler;
  }

  show(sessionId: string): void {
    this.activeSessionId = sessionId;

    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.One);
    } else {
      this.panel = vscode.window.createWebviewPanel(
        'sdlcAgent',
        'SDLC Agent',
        vscode.ViewColumn.One,
        {
          enableScripts: true,
          retainContextWhenHidden: true,
          localResourceRoots: [
            vscode.Uri.joinPath(this.context.extensionUri, 'dist'),
          ],
        },
      );

      this.panel.webview.html = this.buildHtml(this.panel.webview);

      this.panel.webview.onDidReceiveMessage(
        async (message: WebViewCommand) => {
          if (this.activeSessionId && this.commandHandler) {
            await this.commandHandler(message, this.activeSessionId);
          }
        },
        undefined,
        this.context.subscriptions,
      );

      this.panel.onDidChangeViewState(({ webviewPanel }) => {
        if (webviewPanel.visible && this.activeSessionId) {
          const s = this.store.get(this.activeSessionId);
          if (s) { this.postMessage({ type: 'SESSION_UPDATE', session: s }); }
        }
      });

      this.panel.onDidDispose(() => {
        this.panel = undefined;
      });
    }

    const session = this.store.get(sessionId);
    if (session) {
      this.postMessage({ type: 'SESSION_UPDATE', session });
    }
  }

  postMessage(message: ExtensionMessage): void {
    this.panel?.webview.postMessage(message);
  }

  dispose(): void {
    this.cleanup.forEach(fn => fn());
    this.panel?.dispose();
  }

  private buildHtml(webview: vscode.Webview): string {
    const nonce = crypto.randomBytes(16).toString('hex');
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview.js'),
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview.css'),
    );
    const csp = [
      `default-src 'none'`,
      `style-src ${webview.cspSource} 'unsafe-inline'`,
      `script-src 'nonce-${nonce}'`,
      `img-src ${webview.cspSource} data:`,
    ].join('; ');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <link rel="stylesheet" href="${styleUri}">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SDLC Agent</title>
  <style nonce="${nonce}">
    html, body, #root { height: 100%; margin: 0; padding: 0; }
    body { overflow: hidden; }
  </style>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}
