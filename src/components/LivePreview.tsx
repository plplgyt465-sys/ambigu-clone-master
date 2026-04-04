import { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { Monitor, RefreshCw, Wrench } from 'lucide-react';
import type { CodeFile } from '@/hooks/useCodeStore';

interface LivePreviewProps {
  files: CodeFile[];
  onError?: (error: string) => void;
  onAutoFix?: (errorMsg: string) => void;
  isFixing?: boolean;
}

const IFRAME_RUNTIME = `
(function() {
  var hasError = false;
  function reportError(file, msg) {
    hasError = true;
    var display = file ? "Error in " + file + ":\\n" + msg : "Error:\\n" + msg;
    var el = document.getElementById("root");
    if (el) el.innerHTML = '<pre style="color:#f87171;padding:1rem;font-size:13px;white-space:pre-wrap">' + display.replace(/</g,'&lt;') + '</pre>';
    window.parent.postMessage({ type: "preview-error", message: display, file: file }, "*");
  }
  window.onerror = function(msg) { reportError("", String(msg)); };

  var modules = window.__MODULES__;
  var entryName = window.__ENTRY__;
  var cache = {};

  function resolve(name) {
    var n = name.replace(/^\\.\\/?/, "");
    if (modules[n]) return n;
    var exts = [".tsx",".jsx",".ts",".js"];
    for (var i = 0; i < exts.length; i++) { if (modules[n + exts[i]]) return n + exts[i]; }
    for (var i = 0; i < exts.length; i++) { if (modules[n + "/index" + exts[i]]) return n + "/index" + exts[i]; }
    return null;
  }

  function req(name) {
    if (name === "react") return window.React;
    if (name === "react-dom/client" || name === "react-dom") return window.ReactDOM;
    if (name.endsWith(".css")) return {};
    var r = resolve(name);
    if (!r) { console.warn("Module not found:", name); return {}; }
    if (cache[r]) return cache[r].exports;
    var mod = { exports: {} };
    cache[r] = mod;
    try {
      var code = modules[r];
      code = code.replace(/\\\\([!#_*~<>])/g, "$1");

      // Remove type-only imports
      code = code.replace(/import\\s+type\\s+[^;]+;?\\n?/g, "");

      var imps = [];
      // import Default, { named } from 'x'
      code = code.replace(/import\\s+(\\w+)\\s*,\\s*\\{([^}]+)\\}\\s+from\\s+['"]([ ^'"]+)['"];?\\n?/g, function(_, d, n, s) {
        imps.push({t:"d",name:d,src:s}); imps.push({t:"n",names:n,src:s}); return "";
      });
      // import Default from 'x'
      code = code.replace(/import\\s+(\\w+)\\s+from\\s+['"]([^'"]+)['"];?\\n?/g, function(_, n, s) {
        imps.push({t:"d",name:n,src:s}); return "";
      });
      // import * as X from 'x'
      code = code.replace(/import\\s+\\*\\s+as\\s+(\\w+)\\s+from\\s+['"]([^'"]+)['"];?\\n?/g, function(_, n, s) {
        imps.push({t:"ns",name:n,src:s}); return "";
      });
      // import { X, Y } from 'x'
      code = code.replace(/import\\s*\\{([^}]+)\\}\\s*from\\s*['"]([^'"]+)['"];?\\n?/g, function(_, n, s) {
        imps.push({t:"n",names:n,src:s}); return "";
      });
      // import 'x' (side-effect)
      code = code.replace(/import\\s+['"]([^'"]+)['"];?\\n?/g, function(_, s) {
        imps.push({t:"side",src:s}); return "";
      });

      var opts = { presets: [["react", { runtime: "classic" }], "typescript"], filename: r };
      var transformed;
      try { transformed = Babel.transform(code, opts).code; }
      catch(e2) {
        code = code.replace(/\\\\([^\\\\])/g, "$1");
        transformed = Babel.transform(code, opts).code;
      }

      var pre = "";
      for (var i = 0; i < imps.length; i++) {
        var im = imps[i];
        var uid = "_" + Math.random().toString(36).slice(2,6);
        if (im.t === "d") {
          pre += "var _m" + uid + "=req(\\"" + im.src + "\\");var " + im.name + "=_m" + uid + ".default||_m" + uid + ";\\n";
        } else if (im.t === "ns") {
          pre += "var " + im.name + "=req(\\"" + im.src + "\\");\\n";
        } else if (im.t === "n") {
          pre += "var _i" + uid + "=req(\\"" + im.src + "\\");\\n";
          var parts = im.names.split(",");
          for (var j = 0; j < parts.length; j++) {
            var p = parts[j].trim(); if (!p) continue;
            var segs = p.split(/\\s+as\\s+/);
            var orig = segs[0].trim(), alias = (segs[1]||segs[0]).trim();
            pre += "var " + alias + "=_i" + uid + "[\\"" + orig + "\\"]!==undefined?_i" + uid + "[\\"" + orig + "\\"]:window.React&&window.React[\\"" + orig + "\\"];\\n";
          }
        } else if (im.t === "side") {
          pre += "req(\\"" + im.src + "\\");\\n";
        }
      }

      var cjs = transformed;
      cjs = cjs.replace(/export\\s+default\\s+/g, "mod.exports.default=");
      cjs = cjs.replace(/export\\s+(const|let|var|function)\\s+(\\w+)/g, function(_,k,n){return k+" "+n;});

      var fn = new Function("React","ReactDOM","req","mod", pre + cjs);
      fn(window.React, window.ReactDOM, req, mod);

      if (!mod.exports.default && Object.keys(mod.exports).length === 0) {
        mod.exports.default = mod.exports;
      }
    } catch(e) { reportError(r, e.message); }
    return mod.exports;
  }

  try {
    req(entryName);
    if (!hasError) window.parent.postMessage({ type: "preview-success" }, "*");
  } catch(e) { reportError("", e.message); }
})();
`;

const LivePreview = ({ files, onError, onAutoFix, isFixing }: LivePreviewProps) => {
  const [refreshKey, setRefreshKey] = useState(0);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const filesDep = files.map((f) => `${f.name}::${f.content}`).join('|||');

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.data?.type === 'preview-error') {
        setPreviewError(event.data.message || 'Unknown error');
        onError?.(event.data.message);
      } else if (event.data?.type === 'preview-success') {
        setPreviewError(null);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [onError]);

  useEffect(() => { setPreviewError(null); }, [filesDep]);

  const handleAutoFix = useCallback(() => {
    if (previewError && onAutoFix) onAutoFix(previewError);
  }, [previewError, onAutoFix]);

  const srcDoc = useMemo(() => {
    const cssFiles = files.filter((f) => f.name.endsWith('.css'));
    const codeFiles = files.filter((f) =>
      /\.(tsx|jsx|ts|js)$/.test(f.name)
    );

    const allStyles = cssFiles.map((f) => f.content).join('\n\n');
    const moduleContents: Record<string, string> = {};
    for (const f of codeFiles) moduleContents[f.name] = f.content;

    const entryFile =
      files.find((f) => f.name === 'index.tsx') ||
      files.find((f) => f.name === 'index.jsx') ||
      files.find((f) => f.name === 'index.ts') ||
      files.find((f) => f.name === 'index.js') ||
      files.find((f) => f.name === 'App.tsx') ||
      files.find((f) => f.name === 'App.jsx');

    if (!entryFile) {
      const htmlFile = files.find((f) => f.name.endsWith('.html'));
      if (htmlFile) {
        let html = htmlFile.content;
        if (cssFiles.length > 0) {
          const tag = `<style>${allStyles}</style>`;
          html = html.includes('</head>') ? html.replace('</head>', tag + '</head>') : tag + html;
        }
        return html;
      }
      return '<html><body style="color:#94a3b8;display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif"><p>No entry file found</p></body></html>';
    }

    const dataScript = 'window.__MODULES__=' + JSON.stringify(moduleContents) + ';window.__ENTRY__=' + JSON.stringify(entryFile.name) + ';';

    return '<!DOCTYPE html>'
      + '<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
      + '<style>' + allStyles + '</style>'
      + '<script src="https://unpkg.com/react@18/umd/react.development.js"><\/script>'
      + '<script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"><\/script>'
      + '<script src="https://unpkg.com/@babel/standalone/babel.min.js"><\/script>'
      + '</head><body><div id="root"></div>'
      + '<script>' + dataScript + '<\/script>'
      + '<script>' + IFRAME_RUNTIME + '<\/script>'
      + '</body></html>';
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filesDep, refreshKey]);

  return (
    <div className="flex flex-col h-full">
      {/* Preview header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-card">
        <div className="flex items-center gap-2">
          <Monitor className="w-4 h-4 text-primary" />
          <span className="text-xs font-medium text-foreground">Live Preview</span>
        </div>
        <div className="flex items-center gap-1">
          {previewError && onAutoFix && (
            <button
              onClick={handleAutoFix}
              disabled={isFixing}
              className="flex items-center gap-1 px-2 py-1 text-xs bg-warning/20 text-warning rounded hover:bg-warning/30 transition-colors disabled:opacity-50"
            >
              <Wrench className="w-3 h-3" />
              {isFixing ? 'Fixing...' : 'Auto Fix'}
            </button>
          )}
          <button
            onClick={() => setRefreshKey((k) => k + 1)}
            className="p-1.5 text-muted-foreground hover:text-foreground transition-colors"
            title="Refresh preview"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Iframe */}
      <div className="flex-1 bg-[hsl(0,0%,100%)] relative">
        <iframe
          ref={iframeRef}
          key={refreshKey}
          srcDoc={srcDoc}
          className="w-full h-full border-0"
          sandbox="allow-scripts allow-modals"
          title="Live Preview"
        />
      </div>
    </div>
  );
};

export default LivePreview;
