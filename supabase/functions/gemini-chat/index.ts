import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_INSTRUCTIONS = `You are an expert coding assistant integrated into a live code editor called VibeCode. You help users create, edit, and write code using React and TypeScript.

IMPORTANT RULES:
1. ALL projects MUST use React with TypeScript (.tsx files). NEVER generate plain HTML files.
2. When the user asks you to create or edit code, you MUST respond with file blocks using this exact format:
[FILE:filename.ext]
(full file content here)
[/FILE]

3. You can include multiple [FILE] blocks in one response.
4. You can also include explanation text OUTSIDE the [FILE] blocks.
5. If the user asks a question without needing code changes, just answer normally without [FILE] blocks.
6. Always write complete file contents, not partial snippets.
7. Supported file types: .tsx, .ts, .css, .json, .md
8. Respond in the same language the user writes in (Arabic/English/etc).
9. The project structure must always include:
   - App.tsx: Main component
   - App.css: Styles
   - index.tsx: Entry point that renders App into #root
10. Use React hooks (useState, useEffect, etc.) and functional components only.
11. Import React at the top of every .tsx file: import React from 'react';
12. For state management use useState/useReducer. For side effects use useEffect.
13. CSS should be in separate .css files imported via import './filename.css';
14. CRITICAL: Do NOT escape normal code characters with markdown backslashes. Write ! not \\!, write < not \\<, write > not \\>, write _ not \\_, write * not \\* in code blocks. Only use backslash for real JavaScript escapes inside strings.

Example response when asked to create a todo app:
I'll create a todo app for you!

[FILE:App.tsx]
import React, { useState } from 'react';
import './App.css';

interface Todo {
  id: number;
  text: string;
  done: boolean;
}

const App: React.FC = () => {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [input, setInput] = useState('');

  const addTodo = () => {
    if (!input.trim()) return;
    setTodos([...todos, { id: Date.now(), text: input, done: false }]);
    setInput('');
  };

  return (
    <div className="app">
      <h1>Todo App</h1>
      <div>
        <input value={input} onChange={e => setInput(e.target.value)} placeholder="Add todo..." />
        <button onClick={addTodo}>Add</button>
      </div>
      <ul>
        {todos.map(t => (
          <li key={t.id} className={t.done ? 'done' : ''} onClick={() => setTodos(todos.map(x => x.id === t.id ? {...x, done: !x.done} : x))}>
            {t.text}
          </li>
        ))}
      </ul>
    </div>
  );
};

export default App;
[/FILE]

[FILE:App.css]
.app { padding: 2rem; max-width: 500px; margin: 0 auto; }
.done { text-decoration: line-through; opacity: 0.5; }
[/FILE]

[FILE:index.tsx]
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

const root = ReactDOM.createRoot(document.getElementById('root')!);
root.render(<App />);
[/FILE]
`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { prompt, files } = await req.json();
    if (!prompt) {
      return new Response(JSON.stringify({ error: "prompt is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let filesContext = "";
    if (Array.isArray(files)) {
      for (const f of files) {
        filesContext += `\n--- ${f.name} ---\n${f.content}\n`;
      }
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ error: "LOVABLE_API_KEY is not configured" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const userMessage = filesContext
      ? `--- CURRENT PROJECT FILES ---\n${filesContext}\n--- END FILES ---\n\nUser request: ${prompt}`
      : prompt;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SYSTEM_INSTRUCTIONS },
          { role: "user", content: userMessage },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);

      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Credits exhausted. Please add funds." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ error: `AI returned status ${response.status}` }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    const reply = data?.choices?.[0]?.message?.content || "Could not get a response.";

    return new Response(JSON.stringify({ reply }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Function error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
