"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.existsSync = exports.safeReadJson = exports.readJsonSync = exports.readJson = exports.fileExists = exports.dirExists = exports.requireJson = void 0;
const node_fs_1 = require("node:fs");
const promises_1 = require("node:fs/promises");
const node_path_1 = require("node:path");
function requireJson(...pathParts) {
    if ((0, node_fs_1.existsSync)((0, node_path_1.join)(...pathParts))) {
        return JSON.parse((0, node_fs_1.readFileSync)((0, node_path_1.join)(...pathParts), 'utf8'));
    }
    return { name: "@oclif/core", version: "3.0.0" };
}
exports.requireJson = requireJson;
/**
 * Parser for Args.directory and Flags.directory. Checks that the provided path
 * exists and is a directory.
 * @param input flag or arg input
 * @returns Promise<string>
 */
const dirExists = async (input) => {
    let dirStat;
    try {
        dirStat = await (0, promises_1.stat)(input);
    }
    catch {
        throw new Error(`No directory found at ${input}`);
    }
    if (!dirStat.isDirectory()) {
        throw new Error(`${input} exists but is not a directory`);
    }
    return input;
};
exports.dirExists = dirExists;
/**
 * Parser for Args.file and Flags.file. Checks that the provided path
 * exists and is a file.
 * @param input flag or arg input
 * @returns Promise<string>
 */
const fileExists = async (input) => {
    let fileStat;
    try {
        fileStat = await (0, promises_1.stat)(input);
    }
    catch {
        throw new Error(`No file found at ${input}`);
    }
    if (!fileStat.isFile()) {
        throw new Error(`${input} exists but is not a file`);
    }
    return input;
};
exports.fileExists = fileExists;
async function readJson(path) {
    const contents = await (0, promises_1.readFile)(path, 'utf8');
    return JSON.parse(contents);
}
exports.readJson = readJson;
function readJsonSync(path, parse = true) {
    const contents = (0, node_fs_1.readFileSync)(path, 'utf8');
    return parse ? JSON.parse(contents) : contents;
}
exports.readJsonSync = readJsonSync;
async function safeReadJson(path) {
    try {
        return await readJson(path);
    }
    catch { }
}
exports.safeReadJson = safeReadJson;
function existsSync(path) {
    return (0, node_fs_1.existsSync)(path);
}
exports.existsSync = existsSync;
