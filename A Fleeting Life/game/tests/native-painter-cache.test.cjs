'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const typeScriptPaths = [
  process.env.TYPESCRIPT_PATH,
  path.resolve(root, '../需要的软件/CocosCreator/3.8.8/resources/app.asar.unpacked/node_modules/typescript'),
  path.resolve(root, 'node_modules/typescript'),
].filter(Boolean);
let ts;
for (const candidate of typeScriptPaths) {
  try { ts = require(candidate); break; } catch { /* Use the next installed TypeScript. */ }
}

function mockPainter() {
  assert.ok(ts, 'the project TypeScript compiler is needed for the native painter test');
  const source = fs.readFileSync(path.join(root, 'assets/scripts/Bootstrap.ts'), 'utf8');
  const begin = source.indexOf('class CocosPainter implements Painter {');
  const end = source.indexOf('type RawMomentFrame=', begin);
  assert.ok(begin >= 0 && end > begin, 'the native painter class must be present');
  const compiled = ts.transpileModule(source.slice(begin, end), {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
  }).outputText;

  class MockGraphics {
    constructor(node) { this.node = node; this.mesh = []; this.clears = 0; }
    clear() { this.mesh = []; this.clears++; }
    rect(x, y, w, h) { this.pending = { x, y, w, h, color: this.fillColor }; }
    fill() { this.mesh.push(this.pending); }
  }
  class MockNode {
    constructor(name) {
      this.name = name; this.children = []; this.components = new Map();
      this._active = true; this.position = { x: 0, y: 0 };
    }
    get active() { return this._active; }
    set active(value) {
      if (this._active && !value) {
        const graphics = this.components.get(MockGraphics);
        if (graphics) graphics.mesh = []; // A native inactive Graphics node may drop its mesh.
      }
      this._active = value;
    }
    addChild(child) { child.parent = this; this.children.push(child); }
    addComponent(Type) {
      const component = new Type(this); this.components.set(Type, component); return component;
    }
    getComponent(Type) { return this.components.get(Type); }
    getSiblingIndex() { return this.parent.children.indexOf(this); }
    setSiblingIndex(index) {
      const siblings = this.parent.children;
      siblings.splice(siblings.indexOf(this), 1); siblings.splice(index, 0, this);
    }
    setPosition(x, y) { this.position = { x, y }; }
  }
  class MockUITransform {
    setAnchorPoint(x, y) { this.anchorX = x; this.anchorY = y; }
  }
  class MockLabel {
    constructor(node) { this.node = node; this.string = ''; }
  }
  MockLabel.Overflow = { NONE: 0 };
  MockLabel.VerticalAlign = { TOP: 0 };
  MockLabel.HorizontalAlign = { LEFT: 0, CENTER: 1, RIGHT: 2 };
  const Painter = new Function('Node', 'Graphics', 'Label', 'Sprite', 'UITransform', 'Layers',
    'ART_MANIFEST', 'color', compiled + '\nreturn CocosPainter;')(
    MockNode, MockGraphics, MockLabel, class {}, MockUITransform,
    { Enum: { UI_2D: 1 } }, [], value => value);
  return { painter: new Painter(new MockNode('stage')) };
}

test('a memory card redraws its native paper after replay deactivates the pooled Graphics node', () => {
  const { painter } = mockPainter();
  const card = () => {
    painter.begin(true);
    painter.rect(0, 0, 480, 270, '#e9e9dd');
    painter.text('回廊', 23, 17, 29, '#334941');
    painter.rect(24, 16, 432, 236, '#eeeade');
    painter.end();
  };
  card();
  const paper = painter.graphics[1];
  assert.deepEqual(paper.mesh.map(shape => shape.color), ['#eeeade']);
  const initialClears = paper.clears;
  card();
  assert.equal(paper.clears, initialClears, 'an uninterrupted hall card may use its cached mesh');

  painter.begin(false);
  painter.rect(0, 0, 480, 270, '#cbd0c7');
  painter.end();
  assert.equal(paper.node.active, false);
  assert.equal(paper.mesh.length, 0, 'the inactive native node discarded its paper mesh');

  card();
  assert.equal(paper.node.active, true);
  assert.deepEqual(paper.mesh.map(shape => shape.color), ['#eeeade'],
    'returning from replay must restore the opaque paper over the corridor');
  assert.equal(paper.clears, initialClears + 1);
});
