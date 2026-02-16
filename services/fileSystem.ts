import { FileMap, FileMetadata } from '../types';

export class FileSystem {
  private files: FileMap = {};
  private metadata: FileMetadata = {};
  private readonly STORAGE_KEY_FILES = 'aimud_files';
  private readonly STORAGE_KEY_META = 'aimud_metadata';

  constructor() {
    this.loadFromStorage();
  }

  private loadFromStorage() {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY_FILES);
      if (stored) {
        this.files = JSON.parse(stored);
      }
      const storedMeta = localStorage.getItem(this.STORAGE_KEY_META);
      if (storedMeta) {
        this.metadata = JSON.parse(storedMeta);
      }
    } catch (e) {
      console.error('Failed to load files:', e);
    }
  }

  private saveToStorage() {
    try {
      localStorage.setItem(this.STORAGE_KEY_FILES, JSON.stringify(this.files));
      localStorage.setItem(this.STORAGE_KEY_META, JSON.stringify(this.metadata));
    } catch (e) {
      console.error('Failed to save files:', e);
    }
  }

  write(filename: string, content: string, displayName: string | null = null) {
    this.files[filename] = content;
    if (displayName) {
      this.metadata[filename] = { displayName };
    } else if (!this.metadata[filename]) {
      this.metadata[filename] = { displayName: this.generateDisplayName(filename) };
    }
    this.saveToStorage();
  }

  private generateDisplayName(filename: string): string {
    let name = filename.replace(/\.txt$/, '');
    name = name.replace(/_/g, ' ');
    name = name.replace(/\s+\d+$/, '');
    return name;
  }

  getDisplayName(filename: string): string {
    return this.metadata[filename]?.displayName || this.generateDisplayName(filename);
  }

  read(filename: string): string | null {
    return this.files[filename] || null;
  }

  exists(filename: string): boolean {
    return Object.prototype.hasOwnProperty.call(this.files, filename);
  }

  delete(filename: string) {
    delete this.files[filename];
    delete this.metadata[filename];
    this.saveToStorage();
  }

  list(): string[] {
    return Object.keys(this.files).sort();
  }

  getAll(): FileMap {
    return { ...this.files };
  }

  clear() {
    this.files = {};
    this.metadata = {};
    localStorage.removeItem(this.STORAGE_KEY_FILES);
    localStorage.removeItem(this.STORAGE_KEY_META);
  }

  findFileByReference(ref: string): string | null {
    if (this.exists(ref)) return ref;
    if (this.exists(ref + '.txt')) return ref + '.txt';
    
    // Try to find by display name
    for (const [filename, meta] of Object.entries(this.metadata)) {
      if (meta.displayName === ref) return filename;
    }
    
    // Try partial match
    const refLower = ref.toLowerCase();
    for (const filename of Object.keys(this.files)) {
      if (filename.toLowerCase().includes(refLower)) return filename;
    }
    
    return null;
  }
}