import fs from 'fs';
import path from 'path';

// Define interfaces for the session store
interface ChatSession {
  id: string;
  messages: any[];
  metadata?: Record<string, any>;
}

interface SessionStore {
  load(sessionId: string): Promise<ChatSession | undefined>;
  save(sessionId: string, session: ChatSession): Promise<void>;
  list?(): Promise<string[]>;
  delete?(sessionId: string): Promise<void>;
}

/**
 * FileSessionStore implements the SessionStore interface to provide
 * file-based persistence for chat sessions in a Node.js environment.
 */
export class FileSessionStore implements SessionStore {
  private directory: string;

  /**
   * Creates a new FileSessionStore instance
   * @param directory Directory to store session files (default: './sessions')
   */
  constructor(directory = './sessions') {
    this.directory = directory;
    // Ensure the sessions directory exists
    if (!fs.existsSync(this.directory)) {
      fs.mkdirSync(this.directory, { recursive: true });
    }
  }

  /**
   * Get the file path for a session ID
   * @param sessionId The session ID
   * @returns The file path
   */
  private getFilePath(sessionId: string): string {
    return path.join(this.directory, `${sessionId}.json`);
  }

  /**
   * Load a session from file by its ID
   * @param sessionId The ID of the session to load
   * @returns The ChatSession if found, undefined otherwise
   */
  async load(sessionId: string): Promise<ChatSession | undefined> {
    try {
      const filePath = this.getFilePath(sessionId);
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf-8');
        return JSON.parse(content) as ChatSession;
      }
    } catch (e) {
      console.error('Error loading session from file:', e);
    }
    return undefined;
  }

  /**
   * Save a session to file
   * @param sessionId The ID of the session to save
   * @param session The session data to save
   */
  async save(sessionId: string, session: ChatSession): Promise<void> {
    try {
      const filePath = this.getFilePath(sessionId);
      fs.writeFileSync(filePath, JSON.stringify(session, null, 2));
    } catch (e) {
      console.error('Error saving session to file:', e);
    }
  }

  /**
   * List all saved session IDs
   * @returns Array of session IDs
   */
  async list(): Promise<string[]> {
    try {
      const files = fs.readdirSync(this.directory);
      return files
        .filter(file => file.endsWith('.json'))
        .map(file => path.basename(file, '.json'));
    } catch (e) {
      console.error('Error listing sessions from directory:', e);
      return [];
    }
  }

  /**
   * Delete a session file
   * @param sessionId The ID of the session to delete
   */
  async delete(sessionId: string): Promise<void> {
    try {
      const filePath = this.getFilePath(sessionId);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (e) {
      console.error('Error deleting session file:', e);
    }
  }
}
