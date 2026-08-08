/**
 * An in-memory {@link FileSystemPort}, so no test in this package touches a real disk.
 *
 * It models the three things `src/retention.ts`'s prune safety depends on: symlinks (which must be
 * skipped, not followed), non-file entries, and an `unlink` that fails with `EBUSY`/`EPERM` (the
 * Windows behaviour for an open file).
 */
import type { FileFacts, FileSystemPort } from '../../src/retention.js';

interface Entry {
  content: string;
  mtimeMs: number;
  isFile: boolean;
  isSymbolicLink: boolean;
}

export interface MemoryFileSystem extends FileSystemPort {
  /** Creates or replaces an entry. */
  seed(
    directory: string,
    name: string,
    content: string,
    mtimeMs: number,
    kind?: 'file' | 'symlink' | 'directory',
  ): void;
  /** Entry names in `directory`, sorted. */
  list(directory: string): string[];
  content(directory: string, name: string): string | undefined;
  /** Makes `unlink` throw for this name, as an open file does on Windows. */
  lockUnlink(name: string): void;
  /** How many times `mkdir` was called. */
  mkdirCalls(): number;
}

/** `clock` stamps `mtimeMs` on entries created by `append`, mirroring a real filesystem. */
export function createMemoryFileSystem(clock: () => number = () => 0): MemoryFileSystem {
  const entries = new Map<string, Entry>();
  const locked = new Set<string>();
  let mkdirs = 0;

  const join = (directory: string, name: string): string => `${directory}/${name}`;

  return {
    join,
    mkdir(): void {
      mkdirs += 1;
    },
    readdir(directory: string): readonly string[] {
      const prefix = `${directory}/`;
      return [...entries.keys()]
        .filter((path) => path.startsWith(prefix) && !path.slice(prefix.length).includes('/'))
        .map((path) => path.slice(prefix.length));
    },
    lstat(path: string): FileFacts | null {
      const entry = entries.get(path);
      if (entry === undefined) return null;
      return {
        isFile: entry.isFile,
        isSymbolicLink: entry.isSymbolicLink,
        size: entry.content.length,
        mtimeMs: entry.mtimeMs,
      };
    },
    unlink(path: string): void {
      const name = path.slice(path.lastIndexOf('/') + 1);
      if (locked.has(name)) {
        const error = new Error('EBUSY: resource busy or locked');
        (error as Error & { code?: string }).code = 'EBUSY';
        throw error;
      }
      if (!entries.delete(path)) {
        const error = new Error('ENOENT: no such file or directory');
        (error as Error & { code?: string }).code = 'ENOENT';
        throw error;
      }
    },
    append(path: string, contents: string): void {
      const existing = entries.get(path);
      if (existing === undefined) {
        entries.set(path, {
          content: contents,
          mtimeMs: clock(),
          isFile: true,
          isSymbolicLink: false,
        });
        return;
      }
      existing.content += contents;
      existing.mtimeMs = clock();
    },
    seed(directory, name, content, mtimeMs, kind = 'file'): void {
      entries.set(join(directory, name), {
        content,
        mtimeMs,
        isFile: kind === 'file',
        isSymbolicLink: kind === 'symlink',
      });
    },
    list(directory: string): string[] {
      const prefix = `${directory}/`;
      return [...entries.keys()]
        .filter((path) => path.startsWith(prefix))
        .map((path) => path.slice(prefix.length))
        .sort();
    },
    content: (directory, name) => entries.get(join(directory, name))?.content,
    lockUnlink(name: string): void {
      locked.add(name);
    },
    mkdirCalls: () => mkdirs,
  };
}
