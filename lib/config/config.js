"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Config = void 0;
const ejs = __importStar(require("ejs"));
const is_wsl_1 = __importDefault(require("is-wsl"));
const node_os_1 = require("node:os");
const node_path_1 = require("node:path");
const node_url_1 = require("node:url");
const cache_1 = __importDefault(require("../cache"));
const cli_ux_1 = require("../cli-ux");
const theme_1 = require("../cli-ux/theme");
const errors_1 = require("../errors");
const util_1 = require("../help/util");
const module_loader_1 = require("../module-loader");
const performance_1 = require("../performance");
const settings_1 = require("../settings");
const fs_1 = require("../util/fs");
const os_1 = require("../util/os");
const util_2 = require("../util/util");
const plugin_loader_1 = __importDefault(require("./plugin-loader"));
const ts_node_1 = require("./ts-node");
const util_3 = require("./util");
// eslint-disable-next-line new-cap
const debug = (0, util_3.Debug)();
const _pjson = (0, fs_1.requireJson)(__dirname, '..', '..', 'package.json');
const BASE = `${_pjson.name}@${_pjson.version}`;
function channelFromVersion(version) {
    const m = version.match(/[^-]+(?:-([^.]+))?/);
    return (m && m[1]) || 'stable';
}
function isConfig(o) {
    return o && Boolean(o._base);
}
class Permutations extends Map {
    validPermutations = new Map();
    add(permutation, commandId) {
        this.validPermutations.set(permutation, commandId);
        for (const id of (0, util_3.collectUsableIds)([permutation])) {
            if (this.has(id)) {
                this.set(id, this.get(id).add(commandId));
            }
            else {
                this.set(id, new Set([commandId]));
            }
        }
    }
    get(key) {
        return super.get(key) ?? new Set();
    }
    getAllValid() {
        return [...this.validPermutations.keys()];
    }
    getValid(key) {
        return this.validPermutations.get(key);
    }
    hasValid(key) {
        return this.validPermutations.has(key);
    }
}
class Config {
    options;
    arch;
    bin;
    binAliases;
    binPath;
    cacheDir;
    channel;
    configDir;
    dataDir;
    debug = 0;
    dirname;
    errlog;
    flexibleTaxonomy;
    home;
    name;
    npmRegistry;
    nsisCustomization;
    pjson;
    platform;
    plugins = new Map();
    root;
    shell;
    theme;
    topicSeparator = ':';
    userAgent;
    userPJSON;
    valid;
    version;
    warned = false;
    windows;
    _base = BASE;
    _commandIDs;
    _commands = new Map();
    _topics = new Map();
    commandPermutations = new Permutations();
    pluginLoader;
    rootPlugin;
    topicPermutations = new Permutations();
    constructor(options) {
        this.options = options;
    }
    static async load(opts = module.filename || __dirname) {
        // Handle the case when a file URL string is passed in such as 'import.meta.url'; covert to file path.
        if (typeof opts === 'string' && opts.startsWith('file://')) {
            opts = (0, node_url_1.fileURLToPath)(opts);
        }
        if (typeof opts === 'string')
            opts = { root: opts };
        if (isConfig(opts)) {
            /**
             * Reload the Config based on the version required by the command.
             * This is needed because the command is given the Config instantiated
             * by the root plugin, which may be a different version than the one
             * required by the command.
             *
             * Doing this ensures that the command can freely use any method on Config that
             * exists in the version of Config required by the command but may not exist on the
             * root's instance of Config.
             */
            if (BASE !== opts._base) {
                debug(`reloading config from ${opts._base} to ${BASE}`);
                const config = new Config({ ...opts.options, plugins: opts.plugins });
                await config.load();
                return config;
            }
            return opts;
        }
        const config = new Config(opts);
        await config.load();
        return config;
    }
    static get rootPlugin() {
        return this.rootPlugin;
    }
    get commandIDs() {
        if (this._commandIDs)
            return this._commandIDs;
        this._commandIDs = this.commands.map((c) => c.id);
        return this._commandIDs;
    }
    get commands() {
        return [...this._commands.values()];
    }
    get isProd() {
        return (0, util_2.isProd)();
    }
    get topics() {
        return [...this._topics.values()];
    }
    get versionDetails() {
        const [cliVersion, architecture, nodeVersion] = this.userAgent.split(' ');
        return {
            architecture,
            cliVersion,
            nodeVersion,
            osVersion: `${(0, node_os_1.type)()} ${(0, node_os_1.release)()}`,
            pluginVersions: Object.fromEntries([...this.plugins.values()].map((p) => [p.name, { root: p.root, type: p.type, version: p.version }])),
            rootPath: this.root,
            shell: this.shell,
        };
    }
    dir(category) {
        const base = process.env[`XDG_${category.toUpperCase()}_HOME`] ||
            (this.windows && process.env.LOCALAPPDATA) ||
            (0, node_path_1.join)(this.home, category === 'data' ? '.local/share' : '.' + category);
        return (0, node_path_1.join)(base, this.dirname);
    }
    findCommand(id, opts = {}) {
        const lookupId = this.getCmdLookupId(id);
        const command = this._commands.get(lookupId);
        if (opts.must && !command)
            (0, errors_1.error)(`command ${lookupId} not found`);
        return command;
    }
    /**
     * Find all command ids that include the provided command id.
     *
     * For example, if the command ids are:
     * - foo:bar:baz
     * - one:two:three
     *
     * `bar` would return `foo:bar:baz`
     *
     * @param partialCmdId string
     * @param argv string[] process.argv containing the flags and arguments provided by the user
     * @returns string[]
     */
    findMatches(partialCmdId, argv) {
        const flags = argv
            .filter((arg) => !(0, util_1.getHelpFlagAdditions)(this).includes(arg) && arg.startsWith('-'))
            .map((a) => a.replaceAll('-', ''));
        const possibleMatches = [...this.commandPermutations.get(partialCmdId)].map((k) => this._commands.get(k));
        const matches = possibleMatches.filter((command) => {
            const cmdFlags = Object.entries(command.flags).flatMap(([flag, def]) => def.char ? [def.char, flag] : [flag]);
            // A command is a match if the provided flags belong to the full command
            return flags.every((f) => cmdFlags.includes(f));
        });
        return matches;
    }
    findTopic(name, opts = {}) {
        const lookupId = this.getTopicLookupId(name);
        const topic = this._topics.get(lookupId);
        if (topic)
            return topic;
        if (opts.must)
            throw new Error(`topic ${name} not found`);
    }
    /**
     * Returns an array of all command ids. If flexible taxonomy is enabled then all permutations will be appended to the array.
     * @returns string[]
     */
    getAllCommandIDs() {
        return this.getAllCommands().map((c) => c.id);
    }
    /**
     * Returns an array of all commands. If flexible taxonomy is enabled then all permutations will be appended to the array.
     * @returns Command.Loadable[]
     */
    getAllCommands() {
        const commands = [...this._commands.values()];
        const validPermutations = [...this.commandPermutations.getAllValid()];
        for (const permutation of validPermutations) {
            if (!this._commands.has(permutation)) {
                const cmd = this._commands.get(this.getCmdLookupId(permutation));
                commands.push({ ...cmd, id: permutation });
            }
        }
        return commands;
    }
    getPluginsList() {
        return [...this.plugins.values()];
    }
    // eslint-disable-next-line complexity
    async load() {
        settings_1.settings.performanceEnabled =
            (settings_1.settings.performanceEnabled === undefined ? this.options.enablePerf : settings_1.settings.performanceEnabled) ?? false;
        const marker = performance_1.Performance.mark(performance_1.OCLIF_MARKER_OWNER, 'config.load');
        this.pluginLoader = new plugin_loader_1.default({ plugins: this.options.plugins, root: this.options.root });
        this.rootPlugin = await this.pluginLoader.loadRoot();
        // Cache the root plugin so that we can reference it later when determining if
        // we should skip ts-node registration for an ESM plugin.
        const cache = cache_1.default.getInstance();
        cache.set('rootPlugin', this.rootPlugin);
        cache.set('exitCodes', this.rootPlugin.pjson.oclif.exitCodes ?? {});
        this.root = this.rootPlugin.root;
        this.pjson = this.rootPlugin.pjson;
        this.plugins.set(this.rootPlugin.name, this.rootPlugin);
        this.root = this.rootPlugin.root;
        this.pjson = this.rootPlugin.pjson;
        this.name = this.pjson.name;
        this.version = this.options.version || this.pjson.version || '0.0.0';
        this.channel = this.options.channel || channelFromVersion(this.version);
        this.valid = this.rootPlugin.valid;
        this.arch = (0, node_os_1.arch)() === 'ia32' ? 'x86' : (0, node_os_1.arch)();
        this.platform = is_wsl_1.default ? 'wsl' : (0, os_1.getPlatform)();
        this.windows = this.platform === 'win32';
        this.bin = this.pjson.oclif.bin || this.name;
        this.binAliases = this.pjson.oclif.binAliases;
        this.nsisCustomization = this.pjson.oclif.nsisCustomization;
        this.dirname = this.pjson.oclif.dirname || this.name;
        this.flexibleTaxonomy = this.pjson.oclif.flexibleTaxonomy || false;
        // currently, only colons or spaces are valid separators
        if (this.pjson.oclif.topicSeparator && [' ', ':'].includes(this.pjson.oclif.topicSeparator))
            this.topicSeparator = this.pjson.oclif.topicSeparator;
        if (this.platform === 'win32')
            this.dirname = this.dirname.replace('/', '\\');
        this.userAgent = `${this.name}/${this.version} ${this.platform}-${this.arch} node-${process.version}`;
        this.shell = this._shell();
        this.debug = this._debug();
        this.home = process.env.HOME || (this.windows && this.windowsHome()) || (0, os_1.getHomeDir)() || (0, node_os_1.tmpdir)();
        this.cacheDir = this.scopedEnvVar('CACHE_DIR') || this.macosCacheDir() || this.dir('cache');
        this.configDir = this.scopedEnvVar('CONFIG_DIR') || this.dir('config');
        this.dataDir = this.scopedEnvVar('DATA_DIR') || this.dir('data');
        this.errlog = (0, node_path_1.join)(this.cacheDir, 'error.log');
        this.binPath = this.scopedEnvVar('BINPATH');
        this.npmRegistry = this.scopedEnvVar('NPM_REGISTRY') || this.pjson.oclif.npmRegistry;
        if (!this.scopedEnvVarTrue('DISABLE_THEME')) {
            const { theme } = await this.loadThemes();
            this.theme = theme;
        }
        this.pjson.oclif.update = this.pjson.oclif.update || {};
        this.pjson.oclif.update.node = this.pjson.oclif.update.node || {};
        const s3 = this.pjson.oclif.update.s3 || {};
        this.pjson.oclif.update.s3 = s3;
        s3.bucket = this.scopedEnvVar('S3_BUCKET') || s3.bucket;
        if (s3.bucket && !s3.host)
            s3.host = `https://${s3.bucket}.s3.amazonaws.com`;
        s3.templates = {
            ...s3.templates,
            target: {
                baseDir: '<%- bin %>',
                manifest: "<%- channel === 'stable' ? '' : 'channels/' + channel + '/' %><%- platform %>-<%- arch %>",
                unversioned: "<%- channel === 'stable' ? '' : 'channels/' + channel + '/' %><%- bin %>-<%- platform %>-<%- arch %><%- ext %>",
                versioned: "<%- channel === 'stable' ? '' : 'channels/' + channel + '/' %><%- bin %>-v<%- version %>/<%- bin %>-v<%- version %>-<%- platform %>-<%- arch %><%- ext %>",
                ...(s3.templates && s3.templates.target),
            },
            vanilla: {
                baseDir: '<%- bin %>',
                manifest: "<%- channel === 'stable' ? '' : 'channels/' + channel + '/' %>version",
                unversioned: "<%- channel === 'stable' ? '' : 'channels/' + channel + '/' %><%- bin %><%- ext %>",
                versioned: "<%- channel === 'stable' ? '' : 'channels/' + channel + '/' %><%- bin %>-v<%- version %>/<%- bin %>-v<%- version %><%- ext %>",
                ...(s3.templates && s3.templates.vanilla),
            },
        };
        await this.loadPluginsAndCommands();
        debug('config done');
        marker?.addDetails({
            commandPermutations: this.commands.length,
            commands: [...this.plugins.values()].reduce((acc, p) => acc + p.commands.length, 0),
            plugins: this.plugins.size,
            topics: this.topics.length,
        });
        marker?.stop();
    }
    async loadPluginsAndCommands(opts) {
        const pluginsMarker = performance_1.Performance.mark(performance_1.OCLIF_MARKER_OWNER, 'config.loadAllPlugins');
        const { errors, plugins } = await this.pluginLoader.loadChildren({
            dataDir: this.dataDir,
            devPlugins: this.options.devPlugins,
            force: opts?.force ?? false,
            rootPlugin: this.rootPlugin,
            userPlugins: this.options.userPlugins,
        });
        this.plugins = plugins;
        pluginsMarker?.stop();
        const commandsMarker = performance_1.Performance.mark(performance_1.OCLIF_MARKER_OWNER, 'config.loadAllCommands');
        for (const plugin of this.plugins.values()) {
            this.loadCommands(plugin);
            this.loadTopics(plugin);
        }
        commandsMarker?.stop();
        for (const error of errors) {
            this.warn(error);
        }
    }
    async loadThemes() {
        const defaultThemeFile = this.pjson.oclif.theme
            ? (0, node_path_1.resolve)(this.root, this.pjson.oclif.theme)
            : this.pjson.oclif.theme;
        const userThemeFile = (0, node_path_1.resolve)(this.configDir, 'theme.json');
        const [defaultTheme, userTheme] = await Promise.all([
            defaultThemeFile ? await (0, fs_1.safeReadJson)(defaultThemeFile) : undefined,
            await (0, fs_1.safeReadJson)(userThemeFile),
        ]);
        // Merge the default theme with the user theme, giving the user theme precedence.
        const merged = { ...defaultTheme, ...userTheme };
        return {
            // Point to the user file if it exists, otherwise use the default file.
            // This doesn't really serve a purpose to anyone but removing it would be a breaking change.
            file: userTheme ? userThemeFile : defaultThemeFile,
            theme: Object.keys(merged).length > 0 ? (0, theme_1.parseTheme)(merged) : undefined,
        };
    }
    macosCacheDir() {
        return (this.platform === 'darwin' && (0, node_path_1.join)(this.home, 'Library', 'Caches', this.dirname)) || undefined;
    }
    async runCommand(id, argv = [], cachedCommand = null) {
        const marker = performance_1.Performance.mark(performance_1.OCLIF_MARKER_OWNER, `config.runCommand#${id}`);
        debug('runCommand %s %o', id, argv);
        let c = cachedCommand ?? this.findCommand(id);
        if (!c) {
            const matches = this.flexibleTaxonomy ? this.findMatches(id, argv) : [];
            const hookResult = this.flexibleTaxonomy && matches.length > 0
                ? await this.runHook('command_incomplete', { argv, id, matches })
                : await this.runHook('command_not_found', { argv, id });
            if (hookResult.successes[0])
                return hookResult.successes[0].result;
            if (hookResult.failures[0])
                throw hookResult.failures[0].error;
            throw new errors_1.CLIError(`command ${id} not found`);
        }
        if (this.isJitPluginCommand(c)) {
            const pluginName = c.pluginName;
            const pluginVersion = this.pjson.oclif.jitPlugins[pluginName];
            const jitResult = await this.runHook('jit_plugin_not_installed', {
                argv,
                command: c,
                id,
                pluginName,
                pluginVersion,
            });
            if (jitResult.failures[0])
                throw jitResult.failures[0].error;
            if (jitResult.successes[0]) {
                await this.loadPluginsAndCommands({ force: true });
                c = this.findCommand(id) ?? c;
            }
            else {
                // this means that no jit_plugin_not_installed hook exists, so we should run the default behavior
                const result = await this.runHook('command_not_found', { argv, id });
                if (result.successes[0])
                    return result.successes[0].result;
                if (result.failures[0])
                    throw result.failures[0].error;
                throw new errors_1.CLIError(`command ${id} not found`);
            }
        }
        const command = await c.load();
        await this.runHook('prerun', { Command: command, argv });
        const result = (await command.run(argv, this));
        // If plugins:uninstall was run, we need to remove all the uninstalled plugins
        // from this.plugins so that the postrun hook doesn't attempt to run any
        // hooks that might have existed in the uninstalled plugins.
        if (c.id === 'plugins:uninstall') {
            for (const arg of argv)
                this.plugins.delete(arg);
        }
        await this.runHook('postrun', { Command: command, argv, result });
        marker?.addDetails({ command: id, plugin: c.pluginName });
        marker?.stop();
        return result;
    }
    async runHook(event, opts, timeout, captureErrors) {
        const marker = performance_1.Performance.mark(performance_1.OCLIF_MARKER_OWNER, `config.runHook#${event}`);
        debug('start %s hook', event);
        const search = (m) => {
            if (typeof m === 'function')
                return m;
            if (m.default && typeof m.default === 'function')
                return m.default;
            return Object.values(m).find((m) => typeof m === 'function');
        };
        const withTimeout = async (ms, promise) => {
            let id;
            const timeout = new Promise((_, reject) => {
                id = setTimeout(() => {
                    reject(new Error(`Timed out after ${ms} ms.`));
                }, ms).unref();
            });
            return Promise.race([promise, timeout]).then((result) => {
                clearTimeout(id);
                return result;
            });
        };
        const final = {
            failures: [],
            successes: [],
        };
        const promises = [...this.plugins.values()].map(async (p) => {
            const debug = require('debug')([this.bin, p.name, 'hooks', event].join(':'));
            const context = {
                config: this,
                debug,
                error(message, options = {}) {
                    (0, errors_1.error)(message, options);
                },
                exit(code = 0) {
                    (0, errors_1.exit)(code);
                },
                log(message, ...args) {
                    cli_ux_1.ux.info(message, ...args);
                },
                warn(message) {
                    (0, errors_1.warn)(message);
                },
            };
            const hooks = p.hooks[event] || [];
            for (const hook of hooks) {
                const marker = performance_1.Performance.mark(performance_1.OCLIF_MARKER_OWNER, `config.runHook#${p.name}(${hook})`);
                try {
                    /* eslint-disable no-await-in-loop */
                    const { filePath, isESM, module } = await (0, module_loader_1.loadWithData)(p, await (0, ts_node_1.tsPath)(p.root, hook, p));
                    debug('start', isESM ? '(import)' : '(require)', filePath);
                    const result = timeout
                        ? await withTimeout(timeout, search(module).call(context, { ...opts, config: this, context }))
                        : await search(module).call(context, { ...opts, config: this, context });
                    final.successes.push({ plugin: p, result });
                    if (p.name === '@oclif/plugin-legacy' && event === 'init') {
                        this.insertLegacyPlugins(result);
                    }
                    debug('done');
                }
                catch (error) {
                    final.failures.push({ error: error, plugin: p });
                    debug(error);
                    // Do not throw the error if
                    // captureErrors is set to true
                    // error.oclif.exit is undefined or 0
                    // error.code is MODULE_NOT_FOUND
                    if (!captureErrors &&
                        error.oclif?.exit !== undefined &&
                        error.oclif?.exit !== 0 &&
                        error.code !== 'MODULE_NOT_FOUND')
                        throw error;
                }
                marker?.addDetails({
                    event,
                    hook,
                    plugin: p.name,
                });
                marker?.stop();
            }
        });
        await Promise.all(promises);
        debug('%s hook done', event);
        marker?.stop();
        return final;
    }
    s3Key(type, ext, options = {}) {
        if (typeof ext === 'object')
            options = ext;
        else if (ext)
            options.ext = ext;
        const template = this.pjson.oclif.update.s3.templates[options.platform ? 'target' : 'vanilla'][type] ?? '';
        return ejs.render(template, { ...this, ...options });
    }
    s3Url(key) {
        const { host } = this.pjson.oclif.update.s3;
        if (!host)
            throw new Error('no s3 host is set');
        const url = new node_url_1.URL(host);
        url.pathname = (0, node_path_1.join)(url.pathname, key);
        return url.toString();
    }
    scopedEnvVar(k) {
        return process.env[this.scopedEnvVarKeys(k).find((k) => process.env[k])];
    }
    /**
     * this DOES NOT account for bin aliases, use scopedEnvVarKeys instead which will account for bin aliases
     * @param {string} k, the unscoped key you want to get the value for
     * @returns {string} returns the env var key
     */
    scopedEnvVarKey(k) {
        return [this.bin, k]
            .map((p) => p.replaceAll('@', '').replaceAll(/[/-]/g, '_'))
            .join('_')
            .toUpperCase();
    }
    /**
     * gets the scoped env var keys for a given key, including bin aliases
     * @param {string} k, the env key e.g. 'debug'
     * @returns {string[]} e.g. ['SF_DEBUG', 'SFDX_DEBUG']
     */
    scopedEnvVarKeys(k) {
        return [this.bin, ...(this.binAliases ?? [])]
            .filter(Boolean)
            .map((alias) => [alias.replaceAll('@', '').replaceAll(/[/-]/g, '_'), k].join('_').toUpperCase());
    }
    scopedEnvVarTrue(k) {
        const v = this.scopedEnvVar(k);
        return v === '1' || v === 'true';
    }
    warn(err, scope) {
        if (this.warned)
            return;
        if (typeof err === 'string') {
            process.emitWarning(err);
            return;
        }
        if (err instanceof Error) {
            const modifiedErr = err;
            modifiedErr.name = `${err.name} Plugin: ${this.name}`;
            modifiedErr.detail = (0, util_2.compact)([
                err.detail,
                `module: ${this._base}`,
                scope && `task: ${scope}`,
                `plugin: ${this.name}`,
                `root: ${this.root}`,
                'See more details with DEBUG=*',
            ]).join('\n');
            process.emitWarning(err);
            return;
        }
        // err is an object
        process.emitWarning('Config.warn expected either a string or Error, but instead received an object');
        err.name = `${err.name} Plugin: ${this.name}`;
        err.detail = (0, util_2.compact)([
            err.detail,
            `module: ${this._base}`,
            scope && `task: ${scope}`,
            `plugin: ${this.name}`,
            `root: ${this.root}`,
            'See more details with DEBUG=*',
        ]).join('\n');
        process.emitWarning(JSON.stringify(err));
    }
    windowsHome() {
        return this.windowsHomedriveHome() || this.windowsUserprofileHome();
    }
    windowsHomedriveHome() {
        return process.env.HOMEDRIVE && process.env.HOMEPATH && (0, node_path_1.join)(process.env.HOMEDRIVE, process.env.HOMEPATH);
    }
    windowsUserprofileHome() {
        return process.env.USERPROFILE;
    }
    _debug() {
        if (this.scopedEnvVarTrue('DEBUG'))
            return 1;
        try {
            const { enabled } = require('debug')(this.bin);
            if (enabled)
                return 1;
        }
        catch { }
        return 0;
    }
    _shell() {
        let shellPath;
        const { COMSPEC } = process.env;
        const SHELL = process.env.SHELL ?? (0, node_os_1.userInfo)().shell?.split(node_path_1.sep)?.pop();
        if (SHELL) {
            shellPath = SHELL.split('/');
        }
        else if (this.windows && COMSPEC) {
            shellPath = COMSPEC.split(/\\|\//);
        }
        else {
            shellPath = ['unknown'];
        }
        return shellPath.at(-1) ?? 'unknown';
    }
    /**
     * This method is responsible for locating the correct plugin to use for a named command id
     * It searches the {Config} registered commands to match either the raw command id or the command alias
     * It is possible that more than one command will be found. This is due the ability of two distinct plugins to
     * create the same command or command alias.
     *
     * In the case of more than one found command, the function will select the command based on the order in which
     * the plugin is included in the package.json `oclif.plugins` list. The command that occurs first in the list
     * is selected as the command to run.
     *
     * Commands can also be present from either an install or a link. When a command is one of these and a core plugin
     * is present, this function defers to the core plugin.
     *
     * If there is not a core plugin command present, this function will return the first
     * plugin as discovered (will not change the order)
     *
     * @param commands commands to determine the priority of
     * @returns command instance {Command.Loadable} or undefined
     */
    determinePriority(commands) {
        const oclifPlugins = this.pjson.oclif?.plugins ?? [];
        const commandPlugins = commands.sort((a, b) => {
            const pluginAliasA = a.pluginAlias ?? 'A-Cannot-Find-This';
            const pluginAliasB = b.pluginAlias ?? 'B-Cannot-Find-This';
            const aIndex = oclifPlugins.indexOf(pluginAliasA);
            const bIndex = oclifPlugins.indexOf(pluginAliasB);
            // When both plugin types are 'core' plugins sort based on index
            if (a.pluginType === 'core' && b.pluginType === 'core') {
                // If b appears first in the pjson.plugins sort it first
                return aIndex - bIndex;
            }
            // if b is a core plugin and a is not sort b first
            if (b.pluginType === 'core' && a.pluginType !== 'core') {
                return 1;
            }
            // if a is a core plugin and b is not sort a first
            if (a.pluginType === 'core' && b.pluginType !== 'core') {
                return -1;
            }
            // if a is a jit plugin and b is not sort b first
            if (a.pluginType === 'jit' && b.pluginType !== 'jit') {
                return 1;
            }
            // if b is a jit plugin and a is not sort a first
            if (b.pluginType === 'jit' && a.pluginType !== 'jit') {
                return -1;
            }
            // neither plugin is core, so do not change the order
            return 0;
        });
        return commandPlugins[0];
    }
    getCmdLookupId(id) {
        if (this._commands.has(id))
            return id;
        if (this.commandPermutations.hasValid(id))
            return this.commandPermutations.getValid(id);
        return id;
    }
    getTopicLookupId(id) {
        if (this._topics.has(id))
            return id;
        if (this.topicPermutations.hasValid(id))
            return this.topicPermutations.getValid(id);
        return id;
    }
    /**
     * Insert legacy plugins
     *
     * Replace invalid CLI plugins (cli-engine plugins, mostly Heroku) loaded via `this.loadPlugins`
     * with oclif-compatible ones returned by @oclif/plugin-legacy init hook.
     *
     * @param plugins array of oclif-compatible plugins
     * @returns void
     */
    insertLegacyPlugins(plugins) {
        for (const plugin of plugins) {
            this.plugins.set(plugin.name, plugin);
            // Delete all commands from the legacy plugin so that we can re-add them.
            // This is necessary because this.determinePriority will pick the initial
            // command that was added, which won't have been converted by PluginLegacy yet.
            for (const cmd of plugin.commands ?? []) {
                this._commands.delete(cmd.id);
                for (const alias of [...(cmd.aliases ?? []), ...(cmd.hiddenAliases ?? [])]) {
                    this._commands.delete(alias);
                }
            }
            this.loadCommands(plugin);
        }
    }
    isJitPluginCommand(c) {
        // Return true if the command's plugin is listed under oclif.jitPlugins AND if the plugin hasn't been loaded to this.plugins
        return (Object.keys(this.pjson.oclif.jitPlugins ?? {}).includes(c.pluginName ?? '') &&
            Boolean(c?.pluginName && !this.plugins.has(c.pluginName)));
    }
    loadCommands(plugin) {
        const marker = performance_1.Performance.mark(performance_1.OCLIF_MARKER_OWNER, `config.loadCommands#${plugin.name}`, { plugin: plugin.name });
        for (const command of plugin.commands) {
            // set canonical command id
            if (this._commands.has(command.id)) {
                const prioritizedCommand = this.determinePriority([this._commands.get(command.id), command]);
                this._commands.set(prioritizedCommand.id, prioritizedCommand);
            }
            else {
                this._commands.set(command.id, command);
            }
            // v3 moved command id permutations to the manifest, but some plugins may not have
            // the new manifest yet. For those, we need to calculate the permutations here.
            const permutations = this.flexibleTaxonomy && command.permutations === undefined
                ? (0, util_3.getCommandIdPermutations)(command.id)
                : command.permutations ?? [command.id];
            // set every permutation
            for (const permutation of permutations) {
                this.commandPermutations.add(permutation, command.id);
            }
            const handleAlias = (alias, hidden = false) => {
                if (this._commands.has(alias)) {
                    const prioritizedCommand = this.determinePriority([this._commands.get(alias), command]);
                    this._commands.set(alias, { ...prioritizedCommand, id: alias });
                }
                else {
                    this._commands.set(alias, { ...command, hidden, id: alias });
                }
                // set every permutation of the aliases
                // v3 moved command alias permutations to the manifest, but some plugins may not have
                // the new manifest yet. For those, we need to calculate the permutations here.
                const aliasPermutations = this.flexibleTaxonomy && command.aliasPermutations === undefined
                    ? (0, util_3.getCommandIdPermutations)(alias)
                    : command.permutations ?? [alias];
                // set every permutation
                for (const permutation of aliasPermutations) {
                    this.commandPermutations.add(permutation, command.id);
                }
            };
            // set command aliases
            for (const alias of command.aliases ?? []) {
                handleAlias(alias);
            }
            // set hidden command aliases
            for (const alias of command.hiddenAliases ?? []) {
                handleAlias(alias, true);
            }
        }
        marker?.addDetails({ commandCount: plugin.commands.length });
        marker?.stop();
    }
    loadTopics(plugin) {
        const marker = performance_1.Performance.mark(performance_1.OCLIF_MARKER_OWNER, `config.loadTopics#${plugin.name}`, { plugin: plugin.name });
        for (const topic of (0, util_2.compact)(plugin.topics)) {
            const existing = this._topics.get(topic.name);
            if (existing) {
                existing.description = topic.description || existing.description;
                existing.hidden = existing.hidden || topic.hidden;
            }
            else {
                this._topics.set(topic.name, topic);
            }
            const permutations = this.flexibleTaxonomy ? (0, util_3.getCommandIdPermutations)(topic.name) : [topic.name];
            for (const permutation of permutations) {
                this.topicPermutations.add(permutation, topic.name);
            }
        }
        // Add missing topics for displaying help when partial commands are entered.
        for (const c of plugin.commands.filter((c) => !c.hidden)) {
            const parts = c.id.split(':');
            while (parts.length > 0) {
                const name = parts.join(':');
                if (name && !this._topics.has(name)) {
                    this._topics.set(name, { description: c.summary || c.description, name });
                }
                parts.pop();
            }
        }
        marker?.stop();
    }
}
exports.Config = Config;
