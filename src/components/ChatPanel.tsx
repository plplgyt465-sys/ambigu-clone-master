import { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Sparkles, Loader2, FilePlus, FileEdit } from 'lucide-react';
import type { ChatMessage } from '@/hooks/useCodeStore';

interface ChatPanelProps {
  messages: ChatMessage[];
  onSendMessage: (content: string) => void;
  isLoading?: boolean;
}

const ChatPanel = ({ messages, onSendMessage, isLoading }: ChatPanelProps) => {
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = () => {
    if (!input.trim() || isLoading) return;
    onSendMessage(input.trim());
    setInput('');
  };

  return (
    <div className="flex flex-col h-full bg-card border-r border-border">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
        <Sparkles className="w-4 h-4 text-primary" />
        <span className="text-sm font-semibold text-foreground">AI Chat</span>
        <span className="text-xs text-muted-foreground">Assistant</span>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.map((msg) => (
          <div key={msg.id} className="animate-slide-in">
            <div className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : ''}`}>
              {msg.role === 'ai' ? <Bot className="w-5 h-5 text-accent shrink-0 mt-0.5" /> : <User className="w-5 h-5 text-primary shrink-0 mt-0.5" />}
              <div className={`rounded-lg px-3 py-2 text-sm max-w-[85%] ${msg.role === 'user' ? 'bg-[hsl(var(--chat-user))] text-foreground' : 'bg-[hsl(var(--chat-ai))] text-foreground'}`}>
                {msg.content && (
                  <p className="whitespace-pre-wrap break-words leading-relaxed">
                    {msg.content}
                  </p>
                )}
                {msg.fileOps && msg.fileOps.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {msg.fileOps.map((op, i) => (
                      <div key={i} className="flex items-center gap-1.5 text-xs text-muted-foreground bg-secondary/50 rounded px-2 py-1">
                        {op.type === 'create' ? (
                          <FilePlus className="w-3 h-3 text-success" />
                        ) : (
                          <FileEdit className="w-3 h-3 text-warning" />
                        )}
                        <span className="font-mono">{op.filename}</span>
                        <span className="ml-auto text-[10px]">{op.type === 'create' ? 'Created' : 'Updated'}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Thinking...</span>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="p-3 border-t border-border">
        <div className="flex items-center gap-2 bg-secondary rounded-lg px-3 py-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Ask to create code, edit a file..."
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
            disabled={isLoading}
          />
          <button onClick={handleSend} className="text-primary hover:text-primary/80 transition-colors disabled:opacity-50" disabled={isLoading || !input.trim()}>
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChatPanel;
