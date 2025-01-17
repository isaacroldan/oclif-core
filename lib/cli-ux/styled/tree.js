"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Tree = void 0;
const treeify = require('object-treeify');
class Tree {
    nodes = {};
    display(logger = console.log) {
        const addNodes = function (nodes) {
            const tree = {};
            for (const p of Object.keys(nodes)) {
                tree[p] = addNodes(nodes[p].nodes);
            }
            return tree;
        };
        const tree = addNodes(this.nodes);
        logger(treeify(tree));
    }
    insert(child, value = new Tree()) {
        this.nodes[child] = value;
        return this;
    }
    search(key) {
        for (const child of Object.keys(this.nodes)) {
            if (child === key) {
                return this.nodes[child];
            }
            const c = this.nodes[child].search(key);
            if (c)
                return c;
        }
    }
}
exports.Tree = Tree;
function tree() {
    return new Tree();
}
exports.default = tree;
