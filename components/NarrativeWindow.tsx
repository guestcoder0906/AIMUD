import React, { useEffect, useRef } from 'react';
import { NarrativeEntry } from '../types';
import { FileSystem } from '../services/fileSystem';

interface NarrativeWindowProps {
  history: NarrativeEntry[];
  fileSystem: FileSystem; // Passed not for reading, but for resolving references if needed
  onReferenceClick: (ref: string) => void;
  debugMode: boolean;
}

const NarrativeWindow: React.FC<NarrativeWindowProps> = ({ history, onReferenceClick, debugMode }) => {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [history]);

  // Helper to parse text with [Links] and hide[...]
  const parseText = (text: string) => {
    // 1. Handle hide[...]
    let processed = text;
    if (debugMode) {
      processed = processed.replace(/hide\[(.*?)\]/gs, (match, p1) => `<span class="bg-yellow-900/30 text-yellow-300 px-1 rounded border border-yellow-700/50 border-dashed">${p1}</span>`);
    } else {
      processed = processed.replace(/hide\[.*?\]/gs, '<span class="text-gray-600 italic font-mono">[hidden]</span>');
    }

    // 2. Handle [Object] links
    // We split by the regex and map to React elements to avoid dangerouslySetInnerHTML for the whole thing where possible,
    // but mixing regexes is tricky. For a terminal app, dangerous HTML with strict regex control is often cleaner for "rich text".
    processed = processed.replace(/\[([^\]]+)\]/g, (match, ref) => {
       return `<span class="text-yellow-400 hover:text-yellow-200 hover:underline cursor-pointer" data-ref="${ref}">${ref}</span>`;
    });

    return processed;
  };

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (target.dataset.ref) {
      onReferenceClick(target.dataset.ref);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4 font-mono bg-black min-h-0" onClick={handleClick}>
      {history.length === 0 && (
        <div className="text-green-500 italic">
          Initializing system connection...
        </div>
      )}
      
      {history.map((entry) => (
        <div key={entry.id} className={`narrative-entry leading-relaxed ${
          entry.type === 'user' ? 'text-blue-400 font-bold border-l-2 border-blue-900 pl-2' : 
          entry.type === 'system' ? 'text-green-500 italic' : 
          'text-gray-300'
        }`}>
          {entry.type === 'user' && <span className="mr-2">&gt;</span>}
          <span dangerouslySetInnerHTML={{ __html: parseText(entry.text) }} />
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
};

export default NarrativeWindow;