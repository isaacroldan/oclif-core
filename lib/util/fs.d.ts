export declare function requireJson<T>(...pathParts: string[]): T;
/**
 * Parser for Args.directory and Flags.directory. Checks that the provided path
 * exists and is a directory.
 * @param input flag or arg input
 * @returns Promise<string>
 */
export declare const dirExists: (input: string) => Promise<string>;
/**
 * Parser for Args.file and Flags.file. Checks that the provided path
 * exists and is a file.
 * @param input flag or arg input
 * @returns Promise<string>
 */
export declare const fileExists: (input: string) => Promise<string>;
export declare function readJson<T = unknown>(path: string): Promise<T>;
export declare function readJsonSync(path: string, parse: false): string;
export declare function readJsonSync<T = unknown>(path: string, parse?: true): T;
export declare function safeReadJson<T>(path: string): Promise<T | undefined>;
export declare function existsSync(path: string): boolean;
