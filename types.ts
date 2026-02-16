export interface FileData {
  content: string;
  displayName?: string;
}

export interface FileMap {
  [filename: string]: string; // content
}

export interface FileMetadata {
  [filename: string]: {
    displayName: string;
  };
}

export interface UpdateItem {
  type: 'stat' | 'item' | 'time' | 'misc';
  text: string;
  value: number;
}

export interface CheckDef {
  name: string;
  description: string;
  thresholds: { [outcome: string]: number };
}

export interface AIResponse {
  narrative: string;
  updates?: UpdateItem[];
  files?: { [filename: string]: FileData | string };
  checks?: CheckDef[];
  gameOver?: boolean;
}

export interface Message {
  role: 'user' | 'model' | 'system';
  content: string;
}

export interface NarrativeEntry {
  id: string;
  text: string;
  type: 'system' | 'user' | 'ai';
}