import React, { useState } from 'react';
import { UpdateItem } from '../types';
import { FileSystem } from '../services/fileSystem';
import { FileText, ChevronRight, ChevronDown, Activity, Settings, RefreshCw } from 'lucide-react';

interface SidebarProps {
  files: string[];
  fileSystem: FileSystem;
  updates: UpdateItem[];
  debugMode: boolean;
  onToggleDebug: () => void;
  onReset: () => void;
  expandedFile: string | null;
  setExpandedFile: (filename: string | null) => void;
}

const Sidebar: React.FC<SidebarProps> = ({ 
  files, 
  fileSystem, 
  updates, 
  debugMode, 
  onToggleDebug, 
  onReset,
  expandedFile,
  setExpandedFile
}) => {

  const formatContent = (content: string) => {
    if (!content) return '';
    if (debugMode) {
      return content.replace(/hide\[(.*?)\]/gs, '<span class="text-yellow-300 bg-yellow-900/20 px-1 border border-dashed border-yellow-800 rounded">$1</span>');
    }
    return content.replace(/hide\[.*?\]/gs, '<span class="text-gray-600 italic font-mono">[hidden]</span>');
  };

  const parseLinks = (html: string) => {
      // Very basic link highligting within file view, not interactive in sidebar for simplicity, 
      // but styling matches narrative
      return html.replace(/\[([^\]]+)\]/g, '<span class="text-yellow-500">$1</span>');
  };

  return (
    <div className="w-full md:w-80 bg-neutral-900 border-r border-neutral-800 flex flex-col h-[40vh] md:h-full text-xs md:text-sm font-mono overflow-hidden">
      
      {/* Files Section */}
      <div className="flex-1 flex flex-col min-h-0 border-b border-neutral-800">
        <div className="p-2 bg-neutral-950 border-b border-neutral-800 flex justify-between items-center text-gray-400 font-bold uppercase tracking-wider text-[10px]">
          <span className="flex items-center gap-1"><FileText size={12} /> World Files</span>
          <div className="flex items-center gap-3">
             <label className="flex items-center gap-1 cursor-pointer hover:text-white transition-colors">
               <input type="checkbox" checked={debugMode} onChange={onToggleDebug} className="hidden" />
               <Settings size={12} className={debugMode ? "text-yellow-400" : ""} />
               <span className={debugMode ? "text-yellow-400" : ""}>DEBUG</span>
             </label>
             <button onClick={onReset} className="hover:text-red-400 transition-colors" title="Reset World">
                <RefreshCw size={12} />
             </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {files.map(filename => {
            const isExpanded = expandedFile === filename;
            const content = fileSystem.read(filename) || '';
            const displayName = fileSystem.getDisplayName(filename);
            
            return (
              <div key={filename} className="bg-neutral-800/50 rounded overflow-hidden">
                <div 
                  className={`px-2 py-1.5 cursor-pointer hover:bg-neutral-800 flex items-center gap-2 ${isExpanded ? 'bg-neutral-800' : ''}`}
                  onClick={() => setExpandedFile(isExpanded ? null : filename)}
                >
                   {isExpanded ? <ChevronDown size={12} className="text-gray-500" /> : <ChevronRight size={12} className="text-gray-500" />}
                   <span className="text-blue-400 font-semibold truncate">{displayName}</span>
                </div>
                {isExpanded && (
                  <div className="p-2 border-t border-neutral-700 bg-black text-gray-400 whitespace-pre-wrap text-[10px] md:text-xs leading-relaxed">
                    <span dangerouslySetInnerHTML={{ __html: parseLinks(formatContent(content)) }} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Status Section */}
      <div className="h-1/3 min-h-[150px] flex flex-col bg-neutral-950">
        <div className="p-2 border-b border-neutral-800 bg-neutral-900 text-gray-400 font-bold uppercase tracking-wider text-[10px] flex items-center gap-1">
           <Activity size={12} /> System Logs
        </div>
        <div className="flex-1 overflow-y-auto p-2 font-mono text-xs">
           {updates.length === 0 && <span className="text-gray-700 italic">No updates...</span>}
           {updates.map((u, i) => (
             <div key={i} className="mb-1">
               <span className={
                 u.value < 0 ? 'text-red-400' : 
                 u.value > 0 ? 'text-green-400' : 
                 'text-yellow-400'
               }>
                 {u.text}
               </span>
             </div>
           ))}
        </div>
      </div>

    </div>
  );
};

export default Sidebar;