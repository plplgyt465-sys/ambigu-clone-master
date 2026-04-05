import { useCallback } from 'react';
import type { CodeFile } from './useCodeStore';
import type { Diagnostic } from './useStaticAnalysis';

export interface Tool {
  name: string;
  description: string;
  execute: (...args: unknown[]) => unknown;
}

export interface ToolResult {
  tool: string;
  success: boolean;
  result: unknown;
}

export function useToolSystem(
  files: CodeFile[],
  updateFile: (id: string, content: string) => void,
  addFile: (name: string, lang: string) => void,
  deleteFile: (id: string) => void,
  diagnostics: Diagnostic[]
) {
  // Tool: file_reader — read content of a file by name
  const fileReader = useCallback((fileName: string): ToolResult => {
    const file = files.find(f => f.name === fileName);
    if (!file) return { tool: 'file_reader', success: false, result: `File '${fileName}' not found` };
    return { tool: 'file_reader', success: true, result: { name: file.name, content: file.content, language: file.language } };
  }, [files]);

  // Tool: file_writer — write/update a file
  const fileWriter = useCallback((fileName: string, content: string): ToolResult => {
    const file = files.find(f => f.name === fileName);
    if (file) {
      updateFile(file.id, content);
      return { tool: 'file_writer', success: true, result: `Updated '${fileName}'` };
    }
    const ext = fileName.split('.').pop() || 'txt';
    const langMap: Record<string, string> = {
      tsx: 'typescript', ts: 'typescript', jsx: 'javascript', js: 'javascript',
      css: 'css', json: 'json', html: 'html', md: 'markdown',
    };
    addFile(fileName, langMap[ext] || 'plaintext');
    // Content will need to be set after creation — return intent
    return { tool: 'file_writer', success: true, result: `Created '${fileName}'` };
  }, [files, updateFile, addFile]);

  // Tool: file_deleter — delete a file
  const fileDeleter = useCallback((fileName: string): ToolResult => {
    const file = files.find(f => f.name === fileName);
    if (!file) return { tool: 'file_deleter', success: false, result: `File '${fileName}' not found` };
    if (files.length <= 1) return { tool: 'file_deleter', success: false, result: `Cannot delete last file` };
    deleteFile(file.id);
    return { tool: 'file_deleter', success: true, result: `Deleted '${fileName}'` };
  }, [files, deleteFile]);

  // Tool: error_parser — get current diagnostics
  const errorParser = useCallback((): ToolResult => {
    return {
      tool: 'error_parser',
      success: true,
      result: {
        total: diagnostics.length,
        errors: diagnostics.filter(d => d.severity === 'error'),
        warnings: diagnostics.filter(d => d.severity === 'warning'),
        info: diagnostics.filter(d => d.severity === 'info'),
      },
    };
  }, [diagnostics]);

  // Tool: ts_checker — check a specific file for issues
  const tsChecker = useCallback((fileName: string): ToolResult => {
    const fileDiags = diagnostics.filter(d => d.file === fileName);
    return {
      tool: 'ts_checker',
      success: true,
      result: {
        file: fileName,
        issues: fileDiags.length,
        diagnostics: fileDiags,
      },
    };
  }, [diagnostics]);

  // Tool: project_info — get full project structure
  const projectInfo = useCallback((): ToolResult => {
    return {
      tool: 'project_info',
      success: true,
      result: {
        files: files.map(f => ({ name: f.name, language: f.language, lines: f.content.split('\n').length })),
        totalFiles: files.length,
        totalDiagnostics: diagnostics.length,
      },
    };
  }, [files, diagnostics]);

  // Tool registry
  const tools: Tool[] = [
    { name: 'file_reader', description: 'Read content of a file by name', execute: fileReader },
    { name: 'file_writer', description: 'Create or update a file', execute: fileWriter },
    { name: 'file_deleter', description: 'Delete a file from the project', execute: fileDeleter },
    { name: 'error_parser', description: 'Get all current diagnostics and errors', execute: errorParser },
    { name: 'ts_checker', description: 'Check a specific file for TypeScript/syntax issues', execute: tsChecker },
    { name: 'project_info', description: 'Get project structure overview', execute: projectInfo },
  ];

  const executeTool = useCallback((toolName: string, ...args: unknown[]): ToolResult => {
    const tool = tools.find(t => t.name === toolName);
    if (!tool) return { tool: toolName, success: false, result: `Tool '${toolName}' not found` };
    try {
      return tool.execute(...args) as ToolResult;
    } catch (e) {
      return { tool: toolName, success: false, result: String(e) };
    }
  }, [tools]);

  // Generate tool descriptions for AI system prompt
  const getToolDescriptions = useCallback((): string => {
    return tools.map(t => `- ${t.name}: ${t.description}`).join('\n');
  }, [tools]);

  return { tools, executeTool, getToolDescriptions };
}
