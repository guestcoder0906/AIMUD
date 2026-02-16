import React, { useState, useEffect, useRef } from 'react';
import { AIEngine } from './services/aiEngine';
import { FileSystem } from './services/fileSystem';
import { NarrativeEntry, UpdateItem } from './types';
import Sidebar from './components/Sidebar';
import NarrativeWindow from './components/NarrativeWindow';
import InputArea from './components/InputArea';
import Modal from './components/Modal';

// Instantiate services outside component to persist across re-renders
const fileSystem = new FileSystem();
const aiEngine = new AIEngine(fileSystem);

function App() {
  const [narrative, setNarrative] = useState<NarrativeEntry[]>([]);
  const [files, setFiles] = useState<string[]>([]);
  const [updates, setUpdates] = useState<UpdateItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [debugMode, setDebugMode] = useState(false);
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [expandedFile, setExpandedFile] = useState<string | null>(null);
  const [worldTime, setWorldTime] = useState<string>('');
  const [gameOver, setGameOver] = useState(false);

  // Sync state with filesystem on mount and updates
  const syncFiles = () => {
    setFiles(fileSystem.list());
    const timeContent = fileSystem.read('WorldTime.txt');
    if (timeContent) setWorldTime(timeContent);
  };

  useEffect(() => {
    syncFiles();
    // Simple welcome message if empty
    if (fileSystem.list().length === 0) {
       setNarrative([{
         id: 'init',
         text: 'Welcome to AI-MUD Gemini Edition. Enter a scenario prompt to begin (e.g., "A cyberpunk detective in Neo-Tokyo")',
         type: 'system'
       }]);
    } else {
      setIsInitialized(true);
      setNarrative([{
        id: 'resume',
        text: 'Session Resumed. Check logs for last state.',
        type: 'system'
      }]);
    }
  }, []);

  const handleAction = async (text: string) => {
    setIsProcessing(true);
    
    // Add User Action to Narrative
    const userActionId = Date.now().toString();
    setNarrative(prev => [...prev, { id: userActionId, text: text, type: 'user' }]);

    let result;
    if (!isInitialized) {
       result = await aiEngine.initialize(text);
       setIsInitialized(true);
    } else {
       result = await aiEngine.processAction(text);
    }

    if (result) {
      if (result.narrative) {
        setNarrative(prev => [...prev, { id: Date.now().toString() + 'ai', text: result.narrative, type: 'ai' }]);
      }
      
      if (result.updates) {
        setUpdates(prev => [...result.updates!, ...prev].slice(0, 50)); // Keep last 50
      }

      if (result.gameOver) {
        setGameOver(true);
        setNarrative(prev => [...prev, { id: 'death', text: 'CRITICAL FAILURE: Vital signs zero. Simulation Terminated.', type: 'system' }]);
      }

      // Sync File changes
      syncFiles();
    }

    setIsProcessing(false);
  };

  const handleReferenceClick = (ref: string) => {
    const filename = fileSystem.findFileByReference(ref);
    if (filename) {
      setExpandedFile(filename);
    }
  };

  const handleReset = () => {
    fileSystem.clear();
    setNarrative([{
      id: 'reset',
      text: 'System Reset Complete. Enter a new scenario.',
      type: 'system'
    }]);
    setUpdates([]);
    setGameOver(false);
    setIsInitialized(false);
    setExpandedFile(null);
    syncFiles();
    setIsResetModalOpen(false);
  };

  return (
    <div className="flex flex-col md:flex-row h-screen w-full bg-black text-gray-200 overflow-hidden">
      
      <Sidebar 
        files={files}
        fileSystem={fileSystem}
        updates={updates}
        debugMode={debugMode}
        onToggleDebug={() => setDebugMode(!debugMode)}
        onReset={() => setIsResetModalOpen(true)}
        expandedFile={expandedFile}
        setExpandedFile={setExpandedFile}
      />

      <div className="flex-1 flex flex-col min-w-0 min-h-0 relative">
        {/* Top Bar for World Time (Mobile view mostly, but good for all) */}
        <div className="bg-neutral-900 border-b border-neutral-800 p-2 text-center text-xs text-blue-400 font-mono tracking-widest shadow-lg z-10">
           {worldTime || "TIME: UNKNOWN"}
        </div>

        <NarrativeWindow 
          history={narrative}
          onReferenceClick={handleReferenceClick}
          debugMode={debugMode}
          fileSystem={fileSystem}
        />

        {gameOver && (
          <div className="absolute inset-0 flex items-center justify-center bg-red-900/20 backdrop-blur-sm z-20 pointer-events-none">
             <div className="bg-black border-2 border-red-600 p-8 rounded text-center shadow-[0_0_50px_rgba(220,38,38,0.5)]">
               <h1 className="text-4xl font-bold text-red-600 mb-2">TERMINATED</h1>
               <p className="text-gray-400">Please reset the system to restart.</p>
             </div>
          </div>
        )}

        <InputArea onSend={handleAction} disabled={isProcessing || gameOver} />
      </div>

      <Modal 
        isOpen={isResetModalOpen}
        onConfirm={handleReset}
        onCancel={() => setIsResetModalOpen(false)}
      />
    </div>
  );
}

export default App;