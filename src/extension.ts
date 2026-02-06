import * as vscode from 'vscode';
import * as fs from 'fs';

class ArcadiaViewProvider implements vscode.WebviewViewProvider {
	private nextId = 1;
	private terminals = new Map<number, vscode.Terminal>();

	constructor(private readonly extensionUri: vscode.Uri) {}

	resolveWebviewView(webviewView: vscode.WebviewView) {
		webviewView.webview.options = { enableScripts: true };
		webviewView.webview.html = getWebviewContent(webviewView.webview, this.extensionUri);

		webviewView.webview.onDidReceiveMessage((message) => {
			if (message.type === 'openClaude') {
				const id = this.nextId++;
				const terminal = vscode.window.createTerminal(`Claude Code #${id}`);
				terminal.show();
				terminal.sendText('claude');
				this.terminals.set(id, terminal);
				webviewView.webview.postMessage({ type: 'agentCreated', id });
			} else if (message.type === 'focusAgent') {
				const terminal = this.terminals.get(message.id);
				if (terminal) {
					terminal.show();
				}
			}
		});

		// Clean up buttons when terminals are closed
		vscode.window.onDidCloseTerminal((closed) => {
			for (const [id, terminal] of this.terminals) {
				if (terminal === closed) {
					this.terminals.delete(id);
					webviewView.webview.postMessage({ type: 'agentClosed', id });
					break;
				}
			}
		});
	}
}

export function activate(context: vscode.ExtensionContext) {
	const provider = new ArcadiaViewProvider(context.extensionUri);

	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider('arcadia.panelView', provider)
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('arcadia.showPanel', () => {
			vscode.commands.executeCommand('arcadia.panelView.focus');
		})
	);
}

function getWebviewContent(webview: vscode.Webview, extensionUri: vscode.Uri): string {
	const distPath = vscode.Uri.joinPath(extensionUri, 'dist', 'webview');
	const indexPath = vscode.Uri.joinPath(distPath, 'index.html').fsPath;

	let html = fs.readFileSync(indexPath, 'utf-8');

	// Rewrite asset paths to use webview URIs
	html = html.replace(/(href|src)="\.\/([^"]+)"/g, (_match, attr, filePath) => {
		const fileUri = vscode.Uri.joinPath(distPath, filePath);
		const webviewUri = webview.asWebviewUri(fileUri);
		return `${attr}="${webviewUri}"`;
	});

	return html;
}

export function deactivate() {}
