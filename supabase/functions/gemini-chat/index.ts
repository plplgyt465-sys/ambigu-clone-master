import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_INSTRUCTIONS = `You are an expert AI coding assistant integrated into VibeCode — a professional live coding platform. You help users create, edit, and fix code using React and TypeScript.

## MODES
You operate in one of three modes based on the user's request:
- CREATE: Build new features/projects from scratch
- EDIT: Modify existing files with minimal changes
- FIX: Fix specific errors — modify ONLY the file(s) with the problem

## CRITICAL RULES
1. ALL projects MUST use React with TypeScript (.tsx files). NEVER generate plain HTML files.
2. When creating or editing code, respond with file blocks:
[FILE:filename.ext]
(full file content)
[/FILE]

3. You can include multiple [FILE] blocks.
4. Include explanation text OUTSIDE [FILE] blocks.
5. If the user asks a question without needing code changes, answer normally.
6. Always write COMPLETE file contents, not partial snippets.
7. Supported file types: .tsx, .ts, .css, .json, .md
8. Respond in the same language the user writes in.
9. The project structure must always include:
   - App.tsx: Main component
   - App.css: Styles
   - index.tsx: Entry point that renders App into #root
10. Use React hooks and functional components only.
11. Import React at the top of every .tsx file.
12. CRITICAL: Do NOT escape normal code characters with markdown backslashes.

## TOOLS AVAILABLE
You have access to these tools conceptually:
- file_reader: Read any project file (you receive all files in context)
- file_writer: Create/update files using [FILE:] blocks
- error_parser: Analyze errors passed to you
- ts_checker: Validate TypeScript/syntax issues
- project_info: Understand current project structure

## SAFETY RULES
- Do NOT duplicate component declarations
- Do NOT redeclare variables that already exist
- Do NOT break existing imports
- Do NOT delete files unless explicitly asked
- In FIX mode: modify ONLY the broken file(s)
- In EDIT mode: modify ONLY the requested file(s)
- ALWAYS preserve existing functionality

## ERROR FIXING
When fixing errors, follow this process:
1. Identify the EXACT file and line from the error details
2. Read the current content of that file
3. Apply the MINIMAL fix needed
4. Return ONLY the changed file(s) in [FILE:] blocks
5. Do NOT rewrite unrelated files

## DEPENDENCY SYSTEM
When the user needs external libraries, use CDN imports:
import axios from "https://esm.sh/axios"
import lodash from "https://esm.sh/lodash"

## STRUCTURED RESPONSE (for programmatic parsing)
After your explanation and [FILE:] blocks, if there are any issues detected, append:
[DIAGNOSTICS]
{"errors": [{"file": "App.tsx", "line": 12, "message": "description", "type": "SyntaxError"}]}
[/DIAGNOSTICS]
`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { prompt, files, mode, history } = await req.json();
    if (!prompt) {
      return new Response(JSON.stringify({ error: "prompt is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ error: "LOVABLE_API_KEY is not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build file context
    let filesContext = "";
    if (Array.isArray(files)) {
      for (const f of files) {
        filesContext += `\n--- ${f.name} ---\n${f.content}\n`;
      }
    }

    // Build conversation messages
    const messages: { role: string; content: string }[] = [
      { role: "system", content: SYSTEM_INSTRUCTIONS },
    ];

    // Add conversation history (last 10 exchanges for context window management)
    if (Array.isArray(history)) {
      const recentHistory = history.slice(-20); // last 20 messages (10 exchanges)
      for (const msg of recentHistory) {
        messages.push({
          role: msg.role === 'ai' ? 'assistant' : 'user',
          content: msg.content,
        });
      }
    }

    // Add current message with file context
    const modePrefix = mode ? `[MODE: ${mode}]\n` : '';
    const userMessage = filesContext
      ? `${modePrefix}--- CURRENT PROJECT FILES ---\n${filesContext}\n--- END FILES ---\n\nUser request: ${prompt}`
      : `${modePrefix}${prompt}`;

    messages.push({ role: "user", content: userMessage });

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages,
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

    // Extract diagnostics if present
    let diagnostics = null;
    const diagMatch = reply.match(/\[DIAGNOSTICS\]\n([\s\S]*?)\n\[\/DIAGNOSTICS\]/);
    if (diagMatch) {
      try {
        diagnostics = JSON.parse(diagMatch[1]);
      } catch { /* ignore parse errors */ }
    }

    return new Response(JSON.stringify({ reply, diagnostics }), {
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
