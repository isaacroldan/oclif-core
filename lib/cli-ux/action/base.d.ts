import { Options } from './types';
export interface ITask {
    action: string;
    active: boolean;
    status: string | undefined;
}
export type ActionType = 'debug' | 'simple' | 'spinner';
export declare class ActionBase {
    std: 'stderr' | 'stdout';
    protected stdmocks?: ['stderr' | 'stdout', string[]][];
    type: ActionType;
    private stdmockOrigs;
    protected get output(): string | undefined;
    protected set output(output: string | undefined);
    get running(): boolean;
    get status(): string | undefined;
    set status(status: string | undefined);
    get task(): ITask | undefined;
    set task(task: ITask | undefined);
    pause(fn: () => any, icon?: string): Promise<any>;
    pauseAsync<T>(fn: () => Promise<T>, icon?: string): Promise<T>;
    start(action: string, status?: string, opts?: Options): void;
    stop(msg?: string): void;
    protected _flushStdout(): void;
    protected _pause(_?: string): void;
    protected _resume(): void;
    protected _start(_opts: Options): void;
    protected _stdout(toggle: boolean): void;
    protected _stop(_: string): void;
    protected _updateStatus(_: string | undefined, __?: string): void;
    protected _write(std: 'stderr' | 'stdout', s: string | string[]): void;
    private get globals();
}
