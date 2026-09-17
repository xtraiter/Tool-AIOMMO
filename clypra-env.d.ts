interface ImportMetaEnv {
  [key: string]: any;
  DEV: boolean;
  PROD: boolean;
  MODE: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module "@tauri-apps/api/core" {
  export function invoke<T = any>(cmd: string, args?: any, options?: any): Promise<T>;
  export class Channel<T = any> {
    onmessage?: (data: T) => void;
  }
  export function convertFileSrc(path: string): string;
}

declare module "@tauri-apps/api/event" {
  export function listen<T = any>(event: string, handler: (event: any) => void): Promise<any>;
}

declare module "@tauri-apps/api/window" {
  export function getCurrentWindow(): any;
}

declare module "@tauri-apps/api/path" {
  export function appCacheDir(): Promise<string>;
  export function appLocalDataDir(): Promise<string>;
  export function appDataDir(): Promise<string>;
  export function join(...paths: string[]): Promise<string>;
}

declare module "@tauri-apps/plugin-fs" {
  export function exists(path: string, options?: any): Promise<boolean>;
  export function remove(path: string, options?: any): Promise<void>;
  export function mkdir(path: string, options?: any): Promise<void>;
  export function writeFile(path: string, data: Uint8Array, options?: any): Promise<void>;
  export function readFile(path: string, options?: any): Promise<Uint8Array>;
  export function readDir(path: string, options?: any): Promise<any[]>;
  export function writeTextFile(path: string, data: string, options?: any): Promise<void>;
  export function readTextFile(path: string, options?: any): Promise<string>;
  
  export const BaseDirectory: {
    AppCache: number;
    AppLocalData: number;
    AppConfig: number;
    AppData: number;
    Audio: number;
    Cache: number;
    Config: number;
    Data: number;
    Desktop: number;
    Document: number;
    Download: number;
    Executable: number;
    Home: number;
    LocalData: number;
    Picture: number;
    Public: number;
    Runtime: number;
    Template: number;
    Video: number;
  };
}

declare module "@tauri-apps/plugin-dialog" {
  export function save(options?: any): Promise<string | null>;
  export function open(options?: any): Promise<any>;
}

declare module "@tauri-apps/plugin-opener" {
  export function open(path: string): Promise<void>;
  export function openUrl(url: string): Promise<void>;
  export function revealItemInDir(path: string): Promise<void>;
}

declare module "@tauri-apps/plugin-updater" {
  export function check(): Promise<any>;
}

declare module "@tauri-apps/plugin-process" {
  export function relaunch(): Promise<void>;
}

declare module "@capacitor/filesystem" {
  export const Filesystem: any;
  export const Directory: any;
  export const Encoding: {
    UTF8: string;
    ASCII: string;
    BASE64: string;
  };
}

declare module "radix-ui" {
  export const Slot: any;
}
