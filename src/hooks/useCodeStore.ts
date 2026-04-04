import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface CodeFile {
  id: string;
  name: string;
  language: string;
  content: string;
}

export interface FileOperation {
  filename: string;
  content: string;
  type: 'create' | 'update';
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'ai';
  content: string;
  timestamp: Date;
  fileOps?: FileOperation[];
}

const defaultAppTsx = `import React, { useState } from 'react';
import './App.css';

const App: React.FC = () => {
  const [count, setCount] = useState(0);

  return (
    <div className="app">
      <h1>Hello, Vibe Coder! 🚀</h1>
      <p>Start editing to see live changes</p>
      <button onClick={() => setCount(c => c + 1)}>
        Count: {count}
      </button>
    </div>
  );
};

export default App;`;

const defaultAppCss = `.app {
  text-align: center;
  padding: 2rem;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #0f172a, #1e293b);
  color: #e2e8f0;
  font-family: 'Inter', sans-serif;
}

h1 {
  font-size: 2.5rem;
  margin-bottom: 1rem;
  background: linear-gradient(90deg, #22d3ee, #a78bfa);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

p {
  color: #94a3b8;
  margin-bottom: 2rem;
}

button {
  padding: 0.75rem 2rem;
  background: #22d3ee;
  color: #0f172a;
  border: none;
  border-radius: 8px;
  font-weight: 600;
  cursor: pointer;
  font-size: 1rem;
  transition: transform 0.2s, box-shadow 0.2s;
}

button:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 20px rgba(34, 211, 238, 0.3);
}`;

const defaultIndexTsx = `import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

const root = ReactDOM.createRoot(document.getElementById('root')!);
root.render(<App />);`;

const defaultFiles: CodeFile[] = [
  { id: '1', name: 'App.tsx', language: 'typescript', content: defaultAppTsx },
  { id: '2', name: 'App.css', language: 'css', content: defaultAppCss },
  { id: '3', name: 'index.tsx', language: 'typescript', content: defaultIndexTsx },
];

function getLanguageFromFilename(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  const map: Record<string, string> = {
    html: 'html', css: 'css', js: 'javascript', ts: 'typescript',
    jsx: 'javascript', tsx: 'typescript', json: 'json', md: 'markdown', txt: 'plaintext',
  };
  return map[ext] || 'plaintext';
}

function decodeEscapedCodeContent(content: string): string {
  return content
    .replace(/\r\n/g, '\n')
    .replace(/\\!/g, '!')
    .replace(/\\#/g, '#')
    .replace(/\\_/g, '_')
    .replace(/\\\*/g, '*')
    .replace(/\\\[/g, '[')
    .replace(/\\\]/g, ']')
    .replace(/\\\(/g, '(')
    .replace(/\\\)/g, ')')
    .replace(/\\\{/g, '{')
    .replace(/\\\}/g, '}')
    .replace(/\\</g, '<')
    .replace(/\\>/g, '>')
    .replace(/\\~/g, '~');
}

function parseFileOperations(reply: string): { text: string; fileOps: FileOperation[] } {
  const fileOps: FileOperation[] = [];
  const fileRegex = /\[FILE:([\w.\-/]+)\]\n([\s\S]*?)\n?\[\/FILE\]/g;
  let match;

  while ((match = fileRegex.exec(reply)) !== null) {
    fileOps.push({
      filename: match[1].trim(),
      content: decodeEscapedCodeContent(match[2]),
      type: 'create',
    });
  }

  const text = reply.replace(fileRegex, '').trim();
  return { text, fileOps };
}

export function useCodeStore() {
  const [files, setFiles] = useState<CodeFile[]>(defaultFiles);
  const [activeFileId, setActiveFileId] = useState(defaultFiles[0].id);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      id: '1',
      role: 'ai',
      content: 'Welcome! 👋 I\'m your AI assistant. I can create files, edit code, or build entire projects from scratch. Try asking something like "Create a calculator app"!',
      timestamp: new Date(),
    },
  ]);

  const activeFile = files.find((f) => f.id === activeFileId) || files[0];

  const updateFileContent = useCallback((fileId: string, content: string) => {
    setFiles((prev) => prev.map((f) => (f.id === fileId ? { ...f, content } : f)));
  }, []);

  const addFile = useCallback((name: string, language: string) => {
    const newFile: CodeFile = {
      id: Date.now().toString(),
      name,
      language,
      content: '',
    };
    setFiles((prev) => [...prev, newFile]);
    setActiveFileId(newFile.id);
  }, []);

  const deleteFile = useCallback(
    (fileId: string) => {
      setFiles((prev) => {
        const next = prev.filter((f) => f.id !== fileId);
        if (activeFileId === fileId && next.length > 0) {
          setActiveFileId(next[0].id);
        }
        return next;
      });
    },
    [activeFileId]
  );

  const applyFileOperations = useCallback((fileOps: FileOperation[]) => {
    setFiles((prev) => {
      const updated = [...prev];
      for (const op of fileOps) {
        const existingIndex = updated.findIndex((f) => f.name === op.filename);
        if (existingIndex >= 0) {
          updated[existingIndex] = { ...updated[existingIndex], content: op.content };
          op.type = 'update';
        } else {
          const newFile: CodeFile = {
            id: Date.now().toString() + Math.random().toString(36).slice(2),
            name: op.filename,
            language: getLanguageFromFilename(op.filename),
            content: op.content,
          };
          updated.push(newFile);
          op.type = 'create';
        }
      }
      return updated;
    });

    if (fileOps.length > 0) {
      setTimeout(() => {
        setFiles((current) => {
          const target = current.find((f) => f.name === fileOps[0].filename);
          if (target) setActiveFileId(target.id);
          return current;
        });
      }, 50);
    }
  }, []);

  const sendMessage = useCallback(async (content: string) => {
    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content,
      timestamp: new Date(),
    };
    setChatMessages((prev) => [...prev, userMsg]);
    setIsAiLoading(true);

    try {
      let currentFiles: CodeFile[] = [];
      setFiles((prev) => {
        currentFiles = prev;
        return prev;
      });
      const filesPayload = currentFiles.map((f) => ({ name: f.name, content: f.content }));

      const { data, error } = await supabase.functions.invoke('gemini-chat', {
        body: { prompt: content, files: filesPayload },
      });

      if (error) {
        throw new Error('Connection error');
      }

      const rawReply = data?.reply || 'Could not get a response.';
      const { text, fileOps } = parseFileOperations(rawReply);

      if (fileOps.length > 0) {
        applyFileOperations(fileOps);
      }

      const aiMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'ai',
        content: text || (fileOps.length > 0 ? 'Changes applied! ✅' : rawReply),
        timestamp: new Date(),
        fileOps: fileOps.length > 0 ? fileOps : undefined,
      };
      setChatMessages((prev) => [...prev, aiMsg]);
    } catch {
      const aiMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'ai',
        content: 'Sorry, a connection error occurred. Please try again.',
        timestamp: new Date(),
      };
      setChatMessages((prev) => [...prev, aiMsg]);
    } finally {
      setIsAiLoading(false);
    }
  }, [applyFileOperations]);

  const autoFixError = useCallback(async (errorDetails: { file: string; line: number | null; column: number | null; message: string; errorType: string; codeSnippet: string }, allFiles: CodeFile[]) => {
    let fixPrompt = `🔧 AUTO-FIX REQUEST\n\n`;
    fixPrompt += `❌ Error Type: ${errorDetails.errorType}\n`;
    if (errorDetails.file) fixPrompt += `📁 File: ${errorDetails.file}\n`;
    if (errorDetails.line) fixPrompt += `📍 Line: ${errorDetails.line}${errorDetails.column ? `, Column: ${errorDetails.column}` : ''}\n`;
    fixPrompt += `💬 Error Message: ${errorDetails.message}\n`;
    
    if (errorDetails.codeSnippet) {
      fixPrompt += `\n--- Code around the error ---\n${errorDetails.codeSnippet}\n--- End code context ---\n`;
    }

    // Include the full content of the errored file for context
    if (errorDetails.file) {
      const errorFile = allFiles.find(f => f.name === errorDetails.file);
      if (errorFile) {
        fixPrompt += `\n--- Full content of ${errorDetails.file} ---\n${errorFile.content}\n--- End full content ---\n`;
      }
    }

    fixPrompt += `\nFix this ${errorDetails.errorType} error and return the full corrected files using [FILE:filename.ext] blocks. Focus on the specific error location. IMPORTANT: Do not escape normal code characters with markdown backslashes.`;
    
    await sendMessage(fixPrompt);
  }, [sendMessage]);

  return {
    files,
    activeFile,
    activeFileId,
    setActiveFileId,
    updateFileContent,
    addFile,
    deleteFile,
    chatMessages,
    sendMessage,
    isAiLoading,
    autoFixError,
  };
}
