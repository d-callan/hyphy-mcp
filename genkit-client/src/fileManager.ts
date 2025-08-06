import fs from 'fs';
import path from 'path';
import { logger } from '@genkit-ai/core/logging';

export interface UploadedFile {
  filename: string;
  originalName: string;
  path: string;
  size: number;
  mimetype: string;
  sessionId?: string;
  uploadTime: number;
}

/**
 * Simple file manager to track uploaded files and associate them with sessions
 */
class FileManager {
  private files: Map<string, UploadedFile> = new Map();
  private uploadsDir: string;
  
  constructor() {
    this.uploadsDir = path.join(__dirname, '../uploads');
    
    // Create uploads directory if it doesn't exist
    if (!fs.existsSync(this.uploadsDir)) {
      fs.mkdirSync(this.uploadsDir, { recursive: true });
    }
  }
  
  /**
   * Register an uploaded file with the file manager
   */
  registerFile(file: UploadedFile): void {
    this.files.set(file.filename, {
      ...file,
      uploadTime: Date.now()
    });
    logger.info(`Registered file ${file.filename} (${file.originalName}) for session: ${file.sessionId || 'no session'}`);
  }
  
  /**
   * Get all files for a specific session
   */
  getSessionFiles(sessionId: string): UploadedFile[] {
    const sessionFiles: UploadedFile[] = [];
    
    for (const file of this.files.values()) {
      if (file.sessionId === sessionId) {
        sessionFiles.push(file);
      }
    }
    
    return sessionFiles;
  }
  
  /**
   * Get a specific file by filename
   */
  getFile(filename: string): UploadedFile | undefined {
    return this.files.get(filename);
  }
  
  /**
   * Get the most recently uploaded file for a session
   */
  getLatestSessionFile(sessionId: string): UploadedFile | undefined {
    const sessionFiles = this.getSessionFiles(sessionId);
    
    if (sessionFiles.length === 0) {
      return undefined;
    }
    
    // Sort by upload time (newest first)
    sessionFiles.sort((a, b) => b.uploadTime - a.uploadTime);
    
    return sessionFiles[0];
  }
  
  /**
   * Delete a file by filename
   */
  deleteFile(filename: string): boolean {
    const file = this.files.get(filename);
    
    if (!file) {
      return false;
    }
    
    try {
      fs.unlinkSync(file.path);
      this.files.delete(filename);
      return true;
    } catch (error) {
      logger.error(`Error deleting file ${filename}:`, error);
      return false;
    }
  }
  
  /**
   * Clean up old files (older than maxAge in milliseconds)
   */
  cleanupOldFiles(maxAge: number = 24 * 60 * 60 * 1000): void {
    const now = Date.now();
    
    for (const [filename, file] of this.files.entries()) {
      if (now - file.uploadTime > maxAge) {
        this.deleteFile(filename);
      }
    }
  }
}

// Export a singleton instance
export const fileManager = new FileManager();
