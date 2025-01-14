"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Plugin = void 0;
const globby_1 = __importDefault(require("globby"));
const node_path_1 = require("node:path");
const node_util_1 = require("node:util");
const errors_1 = require("../errors");
const module_loader_1 = require("../module-loader");
const performance_1 = require("../performance");
const cache_command_1 = require("../util/cache-command");
const find_root_1 = require("../util/find-root");
const fs_1 = require("../util/fs");
const util_1 = require("../util/util");
const ts_node_1 = require("./ts-node");
const util_2 = require("./util");
const _pjson = (0, fs_1.requireJson)(__dirname, '..', '..', 'package.json');
function topicsToArray(input, base) {
    if (!input)
        return [];
    base = base ? `${base}:` : '';
    if (Array.isArray(input)) {
        return [...input, input.flatMap((t) => topicsToArray(t.subtopics, `${base}${t.name}`))];
    }
    return Object.keys(input).flatMap((k) => {
        input[k].name = k;
        return [{ ...input[k], name: `${base}${k}` }, ...topicsToArray(input[k].subtopics, `${base}${input[k].name}`)];
    });
}
const cachedCommandCanBeUsed = (manifest, id) => Boolean(manifest?.commands[id] && 'isESM' in manifest.commands[id] && 'relativePath' in manifest.commands[id]);
const search = (cmd) => {
    if (typeof cmd.run === 'function')
        return cmd;
    if (cmd.default && cmd.default.run)
        return cmd.default;
    return Object.values(cmd).find((cmd) => typeof cmd.run === 'function');
};
const GLOB_PATTERNS = [
    '**/*.+(js|cjs|mjs|ts|tsx|mts|cts)',
    '!**/*.+(d.ts|test.ts|test.js|spec.ts|spec.js|d.mts|d.cts)?(x)',
];
function processCommandIds(files) {
    return files.map((file) => {
        const p = (0, node_path_1.parse)(file);
        const topics = p.dir.split('/');
        const command = p.name !== 'index' && p.name;
        const id = [...topics, command].filter(Boolean).join(':');
        return id === '' ? '.' : id;
    });
}
class Plugin {
    options;
    alias;
    alreadyLoaded = false;
    children = [];
    commandIDs = [];
    // This will be initialized in the _manifest() method, which gets called in the load() method.
    commands;
    commandsDir;
    hasManifest = false;
    hooks;
    isRoot = false;
    manifest;
    moduleType;
    name;
    parent;
    pjson;
    root;
    tag;
    type;
    valid = false;
    version;
    warned = false;
    _base = `${_pjson.name}@${_pjson.version}`;
    // eslint-disable-next-line new-cap
    _debug = (0, util_2.Debug)();
    flexibleTaxonomy;
    constructor(options) {
        this.options = options;
    }
    get topics() {
        return topicsToArray(this.pjson.oclif.topics || {});
    }
    async findCommand(id, opts = {}) {
        const marker = performance_1.Performance.mark(performance_1.OCLIF_MARKER_OWNER, `plugin.findCommand#${this.name}.${id}`, {
            id,
            plugin: this.name,
        });
        const fetch = async () => {
            const commandsDir = await this.getCommandsDir();
            if (!commandsDir)
                return;
            let module;
            let isESM;
            let filePath;
            try {
                ;
                ({ filePath, isESM, module } = cachedCommandCanBeUsed(this.manifest, id)
                    ? await (0, module_loader_1.loadWithDataFromManifest)(this.manifest.commands[id], this.root)
                    : await (0, module_loader_1.loadWithData)(this, (0, node_path_1.join)(commandsDir ?? this.pjson.oclif.commands, ...id.split(':'))));
                this._debug(isESM ? '(import)' : '(require)', filePath);
            }
            catch (error) {
                if (!opts.must && error.code === 'MODULE_NOT_FOUND')
                    return;
                throw error;
            }
            const cmd = search(module);
            if (!cmd)
                return;
            cmd.id = id;
            cmd.plugin = this;
            cmd.isESM = isESM;
            cmd.relativePath = (0, node_path_1.relative)(this.root, filePath || '').split(node_path_1.sep);
            return cmd;
        };
        const cmd = await fetch();
        if (!cmd && opts.must)
            (0, errors_1.error)(`command ${id} not found`);
        marker?.stop();
        return cmd;
    }
    async load() {
        this.type = this.options.type ?? 'core';
        this.tag = this.options.tag;
        this.isRoot = this.options.isRoot ?? false;
        if (this.options.parent)
            this.parent = this.options.parent;
        // Linked plugins already have a root so there's no need to search for it.
        // However there could be child plugins nested inside the linked plugin, in which
        // case we still need to search for the child plugin's root.
        const root = this.type === 'link' && !this.parent ? this.options.root : await (0, find_root_1.findRoot)(this.options.name, this.options.root);
        if (!root)
            throw new errors_1.CLIError(`could not find package.json with ${(0, node_util_1.inspect)(this.options)}`);
        this.root = root;
        this._debug(`loading ${this.type} plugin from ${root}`);
        this.pjson = await (0, fs_1.readJson)((0, node_path_1.join)(root, 'package.json'));
        this.flexibleTaxonomy = this.options?.flexibleTaxonomy || this.pjson.oclif?.flexibleTaxonomy || false;
        this.moduleType = this.pjson.type === 'module' ? 'module' : 'commonjs';
        this.name = this.pjson.name;
        this.alias = this.options.name ?? this.pjson.name;
        const pjsonPath = (0, node_path_1.join)(root, 'package.json');
        if (!this.name)
            throw new errors_1.CLIError(`no name in ${pjsonPath}`);
        // eslint-disable-next-line new-cap
        this._debug = (0, util_2.Debug)(this.name);
        this.version = this.pjson.version;
        if (this.pjson.oclif) {
            this.valid = true;
        }
        else {
            this.pjson.oclif = this.pjson['cli-engine'] || {};
        }
        this.hooks = Object.fromEntries(Object.entries(this.pjson.oclif.hooks ?? {}).map(([k, v]) => [k, (0, util_1.castArray)(v)]));
        this.manifest = await this._manifest();
        this.commands = Object.entries(this.manifest.commands)
            .map(([id, c]) => ({
            ...c,
            load: async () => this.findCommand(id, { must: true }),
            pluginAlias: this.alias,
            pluginType: c.pluginType === 'jit' ? 'jit' : this.type,
        }))
            .sort((a, b) => a.id.localeCompare(b.id));
    }
    async _manifest() {
        const ignoreManifest = Boolean(this.options.ignoreManifest);
        const errorOnManifestCreate = Boolean(this.options.errorOnManifestCreate);
        const respectNoCacheDefault = Boolean(this.options.respectNoCacheDefault);
        const readManifest = async (dotfile = false) => {
            try {
                const p = (0, node_path_1.join)(this.root, `${dotfile ? '.' : ''}oclif.manifest.json`);
                const manifest = await (0, fs_1.readJson)(p);
                if (!process.env.OCLIF_NEXT_VERSION && manifest.version.split('-')[0] !== this.version.split('-')[0]) {
                    process.emitWarning(`Mismatched version in ${this.name} plugin manifest. Expected: ${this.version} Received: ${manifest.version}\nThis usually means you have an oclif.manifest.json file that should be deleted in development. This file should be automatically generated when publishing.`);
                }
                else {
                    this._debug('using manifest from', p);
                    this.hasManifest = true;
                    return manifest;
                }
            }
            catch (error) {
                if (error.code === 'ENOENT') {
                    if (!dotfile)
                        return readManifest(true);
                }
                else {
                    this.warn(error, 'readManifest');
                }
            }
        };
        const marker = performance_1.Performance.mark(performance_1.OCLIF_MARKER_OWNER, `plugin.manifest#${this.name}`, { plugin: this.name });
        if (!ignoreManifest) {
            const manifest = await readManifest();
            if (manifest) {
                marker?.addDetails({ commandCount: Object.keys(manifest.commands).length, fromCache: true });
                marker?.stop();
                this.commandIDs = Object.keys(manifest.commands);
                return manifest;
            }
        }
        this.commandIDs = await this.getCommandIDs();
        const manifest = {
            commands: (await Promise.all(this.commandIDs.map(async (id) => {
                try {
                    const cached = await (0, cache_command_1.cacheCommand)(await this.findCommand(id, { must: true }), this, respectNoCacheDefault);
                    if (this.flexibleTaxonomy) {
                        const permutations = (0, util_2.getCommandIdPermutations)(id);
                        const aliasPermutations = cached.aliases.flatMap((a) => (0, util_2.getCommandIdPermutations)(a));
                        return [id, { ...cached, aliasPermutations, permutations }];
                    }
                    return [id, cached];
                }
                catch (error) {
                    const scope = 'cacheCommand';
                    if (Boolean(errorOnManifestCreate) === false)
                        this.warn(error, scope);
                    else
                        throw this.addErrorScope(error, scope);
                }
            })))
                // eslint-disable-next-line unicorn/no-await-expression-member, unicorn/prefer-native-coercion-functions
                .filter((f) => Boolean(f))
                .reduce((commands, [id, c]) => {
                commands[id] = c;
                return commands;
            }, {}),
            version: this.version,
        };
        marker?.addDetails({ commandCount: Object.keys(manifest.commands).length, fromCache: false });
        marker?.stop();
        return manifest;
    }
    addErrorScope(err, scope) {
        err.name = `${err.name} Plugin: ${this.name}`;
        err.detail = (0, util_1.compact)([
            err.detail,
            `module: ${this._base}`,
            scope && `task: ${scope}`,
            `plugin: ${this.name}`,
            `root: ${this.root}`,
            'See more details with DEBUG=*',
        ]).join('\n');
        return err;
    }
    async getCommandIDs() {
        const commandsDir = await this.getCommandsDir();
        if (!commandsDir)
            return [];
        const marker = performance_1.Performance.mark(performance_1.OCLIF_MARKER_OWNER, `plugin.getCommandIDs#${this.name}`, { plugin: this.name });
        this._debug(`loading IDs from ${commandsDir}`);
        const files = await (0, globby_1.default)(GLOB_PATTERNS, { cwd: commandsDir });
        const ids = processCommandIds(files);
        this._debug('found commands', ids);
        marker?.addDetails({ count: ids.length });
        marker?.stop();
        return ids;
    }
    async getCommandsDir() {
        if (this.commandsDir)
            return this.commandsDir;
        this.commandsDir = await (0, ts_node_1.tsPath)(this.root, this.pjson.oclif.commands, this);
        return this.commandsDir;
    }
    warn(err, scope) {
        if (this.warned)
            return;
        if (typeof err === 'string')
            err = new Error(err);
        process.emitWarning(this.addErrorScope(err, scope));
    }
}
exports.Plugin = Plugin;
