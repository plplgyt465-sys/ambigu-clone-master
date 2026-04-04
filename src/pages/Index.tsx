import { useState } from 'react';
import { Code2, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import ChatPanel from '@/components/ChatPanel';
import FileTabs from '@/components/FileTabs';
import CodeEditor from '@/components/CodeEditor';
import LivePreview from '@/components/LivePreview';
import type { ErrorDetails } from '@/components/LivePreview';
import { useCodeStore } from '@/hooks/useCodeStore';

const Index = () => {
  const {
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
  } = useCodeStore();

  const [chatOpen, setChatOpen] = useState(true);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background">
      {/* Chat Sidebar */}
      {chatOpen && (
        <div className="w-80 min-w-[280px] shrink-0">
          <ChatPanel messages={chatMessages} onSendMessage={sendMessage} isLoading={isAiLoading} />
        </div>
      )}

      {/* Main Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <div className="flex items-center gap-3 px-4 py-2 border-b border-border bg-card">
          <button
            onClick={() => setChatOpen(!chatOpen)}
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            title={chatOpen ? 'Hide chat' : 'Show chat'}
          >
            {chatOpen ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeftOpen className="w-4 h-4" />}
          </button>
          <Code2 className="w-5 h-5 text-primary" />
          <span className="text-sm font-bold text-foreground tracking-tight">VibeCode</span>
          <span className="text-xs text-muted-foreground">Platform</span>
        </div>

        {/* Editor + Preview */}
        <div className="flex-1 flex min-h-0">
          {/* Editor */}
          <div className="flex-1 flex flex-col min-w-0 border-r border-border">
            <FileTabs
              files={files}
              activeFileId={activeFileId}
              onSelectFile={setActiveFileId}
              onAddFile={addFile}
              onDeleteFile={deleteFile}
            />
            <div className="flex-1 min-h-0">
              <CodeEditor
                content={activeFile.content}
                language={activeFile.language}
                onChange={(c) => updateFileContent(activeFile.id, c)}
              />
            </div>
          </div>

          {/* Preview */}
          <div className="flex-1 min-w-0">
            <LivePreview
              files={files}
              onAutoFix={autoFixError}
              isFixing={isAiLoading}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default Index;
