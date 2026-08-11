import { access, readdir, copyFile, mkdir } from 'fs/promises';
import { join, extname, dirname, basename } from 'path';

export { readRxdataFile, writeRxdataFile } from './rxdata.js';

/**
 * One-time-per-session backup: before the first write to a file, copy it
 * to a .mcp-backup folder next to it. Subsequent writes in the same server
 * session reuse the same backup, so the backup always reflects the state
 * before this session's edits.
 */
const backedUp = new Set<string>();

export async function backupBeforeWrite(filePath: string): Promise<void> {
  if (backedUp.has(filePath)) return;
  backedUp.add(filePath);
  try {
    await access(filePath);
  } catch {
    return; // nothing to back up (new file)
  }
  const backupDir = join(dirname(filePath), '.mcp-backup');
  await mkdir(backupDir, { recursive: true });
  await copyFile(filePath, join(backupDir, basename(filePath) + '.bak'));
}

/**
 * List all files in a directory with a specific extension
 */
export async function listFiles(dirPath: string, extension: string): Promise<string[]> {
  try {
    const files = await readdir(dirPath);
    return files.filter(file => extname(file) === extension);
  } catch (error) {
    throw new Error(`Failed to list files in ${dirPath}: ${error}`);
  }
}

/**
 * Get the full path to a data file in an RPG Maker XP project
 */
export function getDataPath(projectPath: string, fileName: string): string {
  return join(projectPath, 'Data', fileName);
}

/**
 * Get the full path to a map file in an RPG Maker XP project
 */
export function getMapPath(projectPath: string, mapId: number): string {
  const fileName = `Map${String(mapId).padStart(3, '0')}.rxdata`;
  return getDataPath(projectPath, fileName);
}

/**
 * Get the full path to the project's Game.ini (holds the game title)
 */
export function getGameIniPath(projectPath: string): string {
  return join(projectPath, 'Game.ini');
}

/**
 * Validate RPG Maker XP project path.
 * Requires a Data directory containing System.rxdata; Game.rxproj is not
 * required so the server also works on bare Data folders.
 */
export async function validateProjectPath(projectPath: string): Promise<boolean> {
  try {
    await access(getDataPath(projectPath, 'System.rxdata'));
    return true;
  } catch {
    return false;
  }
}
