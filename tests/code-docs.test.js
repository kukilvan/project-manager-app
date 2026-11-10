// Checks the code map, header comments and the comment language (tools/code-map.mjs, tools/ru-comments.mjs, tools/same-code.mjs); offline, no build.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as map from '../tools/code-map.mjs';
import * as ru from '../tools/ru-comments.mjs';
import { sameCode } from '../tools/same-code.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const long = (n) => `Holds ${'x'.repeat(n - 7)}.`;

test('code map: firstSentence', () => {
  assert.equal(map.firstSentence('Merges points (see merge.js) and counts 1.2 cables. Talks to repo.'), 'Merges points (see merge.js) and counts 1.2 cables.');
  assert.equal(map.firstSentence('Builds racks, e.g. Panels and ports. Next'), 'Builds racks, e.g. Panels and ports.');
  assert.equal(map.firstSentence('Holds the Repo. then more words. Next one'), 'Holds the Repo. then more words.');
  assert.equal(map.firstSentence('Opens a.b. then reads src/app/ files. Next'), 'Opens a.b. then reads src/app/ files.');
  assert.equal(map.firstSentence('Holds X. Talks to Y'), 'Holds X.');
  assert.equal(map.firstSentence('Is it a plan? Yes'), 'Is it a plan?');
  assert.equal(map.firstSentence('Stop now! Then go'), 'Stop now!');
  assert.equal(map.firstSentence('Holds the points\nof one   project'), 'Holds the points of one project');
  assert.equal(map.firstSentence('Holds 2.5 m. 3 more'), 'Holds 2.5 m. 3 more');
  const e = map.entryOf('src/x.js', `// ${long(201)}\nexport {};\n`);
  assert.equal(e.sentence.length, 201);
  assert.equal(e.tooLong, true);
  assert.equal(map.entryOf('src/x.js', `// ${long(200)}\n`).tooLong, false);
});

test('code map: headerOf', () => {
  assert.equal(map.headerOf('// First line.\n// Second line.\n//\n// Contents:\nimport x from "y";\n'), 'First line.\nSecond line.\n\nContents:');
  assert.equal(map.headerOf('/* Block header.\n * Second line.\n */\nconst a = 1;\n'), 'Block header.\nSecond line.');
  assert.equal(map.headerOf('/**\n * Doc header.\n * More.\n */\n'), 'Doc header.\nMore.');
  assert.equal(map.headerOf('#!/usr/bin/env node\n\n// Tool header.\n'), 'Tool header.');
  assert.equal(map.headerOf('import x from "y";\n// Not a header.\n'), null);
  assert.equal(map.headerOf('const a = 1;\n'), null);
  const two = map.headerOf('// Para one.\n\n// Para two.\nconst a = 1;\n');
  assert.equal(two, 'Para one.\n\nPara two.');
  assert.equal(map.firstParagraph(two), 'Para one.');
  assert.equal(map.headerOf('\r\n// CRLF header.\r\n// Line two.\r\n'), 'CRLF header.\nLine two.');
});

test('code map: entryOf — English, Russian, no header', () => {
  assert.equal(map.entryOf('src/a.js', '// Holds the «Точки» tab. Talks to repo.\n').line, '- `src/a.js` — Holds the «Точки» tab.');
  assert.equal(map.entryOf('src/a.js', '// Экран точек.\n').line, `- \`src/a.js\` — ${map.NO_HEADER}`);
  assert.equal(map.entryOf('src/a.js', 'export {};\n').line, `- \`src/a.js\` — ${map.NO_HEADER}`);
});

test('code map: renderMap', () => {
  const crlf = 'Top\r\n<!-- code-map:start (built) -->\r\n- `old` — stale\r\n<!-- code-map:end -->\r\nEnd\r\n';
  assert.equal(map.renderMap(crlf, ['- `a` — A.', '- `b` — B.']), 'Top\r\n<!-- code-map:start (built) -->\r\n- `a` — A.\r\n- `b` — B.\r\n<!-- code-map:end -->\r\nEnd\r\n');
  const lf = 'Top\n<!-- code-map:start -->\n<!-- code-map:end -->\n';
  assert.equal(map.renderMap(lf, ['- `a` — A.']), 'Top\n<!-- code-map:start -->\n- `a` — A.\n<!-- code-map:end -->\n');
  assert.throws(() => map.renderMap('no markers here\n', []), /markers/);
  assert.throws(() => map.renderMap('<!-- code-map:start -->\n', []), /markers/);
});

test('comments: JavaScript — strings, templates and regexes are not comments', () => {
  const js = [
    "const a = 'строка // не комментарий';",
    'const b = `шаблон ${a} /* тоже нет */`;',
    'const c = /кириллица\\/\\/x/u;',
    '// комментарий',
    '/* блок',
    '   второй */ const d = 1;',
  ].join('\n');
  assert.deepEqual(ru.commentsOf('src/x.js', js), [{ line: 4, text: ' комментарий' }, { line: 5, text: ' блок\n   второй ' }]);
  assert.throws(() => ru.commentsOf('src/x.js', 'const = ;'));
});

test('comments: CSS', () => {
  const css = '.a::before { content: "/* не комментарий */"; }\n/* тема */\n.b { color: red; } /* ещё */\n';
  assert.deepEqual(ru.commentsOf('src/style.css', css), [{ line: 2, text: ' тема ' }, { line: 3, text: ' ещё ' }]);
});

test('comments: Python — strings, docstrings, print(__doc__)', () => {
  const py = [
    '#!/usr/bin/env python3',
    'x = "# не комментарий"',
    'y = f"{x} # тоже нет"  # комментарий',
    'def f():',
    '    """Докстрока."""',
    '    s = """не докстрока"""',
    '    return g(',
    '        """аргумент"""',
    '    )',
  ].join('\n');
  assert.deepEqual(ru.commentsOf('tools/a.py', py), [
    { line: 1, text: '!/usr/bin/env python3' },
    { line: 3, text: ' комментарий' },
    { line: 5, text: 'Докстрока.' },
  ]);
  const help = '"""Справка: как запускать."""\nimport sys\ndef f():\n    """Докстрока функции."""\nprint(__doc__)\n';
  assert.deepEqual(ru.commentsOf('tools/a.py', help), [{ line: 4, text: 'Докстрока функции.' }]);
  const noHelp = '"""Модуль."""\nimport sys\n';
  assert.deepEqual(ru.commentsOf('tools/a.py', noHelp), [{ line: 1, text: 'Модуль.' }]);
});

test('comments: YAML and Firestore rules', () => {
  const yml = "# шапка\nname: 'a # не комментарий'\non:\n  - cron: '0 9 * * 1'   # раз в неделю\nurl: http://x#y\nrun: |\n  echo \"# нет\" # да\n";
  assert.deepEqual(ru.commentsOf('.github/workflows/a.yml', yml), [
    { line: 1, text: ' шапка' },
    { line: 4, text: ' раз в неделю' },
    { line: 7, text: ' да' },
  ]);
  const rules = "rules_version = '2';\nmatch /databases/{db}/documents {  // база\n  allow read: if x == 'a//b'; // правило\n}\n";
  assert.deepEqual(ru.commentsOf('firestore.rules', rules), [{ line: 2, text: ' база' }, { line: 3, text: ' правило' }]);
});

test('comments: isRussian', () => {
  assert.equal(ru.isRussian('the «Точки» tab'), false);
  assert.equal(ru.isRussian('«Точки» таб'), true);
  assert.equal(ru.isRussian('project «Демо «Офис»» name'), false);
  assert.equal(ru.isRussian('דו"ח יומי'), false);
  assert.equal(ru.isRussian({ text: 'plain English' }), false);
});

test('same-code: per-file comparison', () => {
  assert.equal(sameCode('src/a.js', 'const a = 1; // старый\n', 'const a = 1; // new\n'), true);
  assert.equal(sameCode('src/a.js', "const a = 'x';\n", "const a = 'y';\n"), false);
  assert.equal(sameCode('src/a.js', 'f(a)\n', 'f(a, b)\n'), false);
  assert.equal(sameCode('src/a.js', 'const a = `x\ny`;\nf(a);\n', 'const a = `x\r\ny`;\r\nf(a);\r\n'), true);
  // a block comment that loses its line break can change automatic semicolon insertion
  assert.equal(sameCode('src/a.js', 'function f() { return /* a\n */ 1; }\n', 'function f() { return /* b */ 1; }\n'), false);
  // a header comment added above the first token is not a code change (no statement before it)
  assert.equal(sameCode('src/a.js', "export * from './b.js';\n", "// Re-exports b.\n\nexport * from './b.js';\n"), true);
  assert.equal(sameCode('src/style.css', '/* тема */\n.a { color: red; }\n', '/* theme,\n   two lines */\n.a { color: red; }  \n'), true);
  assert.equal(sameCode('src/style.css', '.a { color: red; }\n', '.a { color: blue; }\n'), false);
  assert.equal(sameCode('tools/a.py', 'def f():\n    """Док."""\n    return 1  # раз\n', 'def f():\n    """Doc,\n    two lines."""\n    return 1  # one\n'), true);
  assert.equal(sameCode('a.yml', 'on: push  # старт\n', 'on: push  # start\r\n'), true);
  assert.equal(sameCode('firestore.rules', 'allow read; // да\n', 'allow write; // yes\n'), false);
});

test('repo: the code map is current and has no problems', () => {
  const { stale, problems } = map.checkMap(root);
  assert.deepEqual(problems, []);
  assert.equal(stale, false, 'docs/code-map.md is stale: run node tools/code-map.mjs');
});

test('repo: every Russian comment is in a PENDING path', () => {
  const { hits, problems } = ru.scanScope(root);
  assert.deepEqual(problems, []);
  assert.deepEqual(hits.filter((h) => !ru.isPending(h.file)).map((h) => `${h.file}:${h.line}`), []);
});

test('repo: every test module starts with a comment', () => {
  const files = fs.readdirSync(path.join(root, 'tests')).filter((f) => f.endsWith('.test.js')).map((f) => `tests/${f}`);
  const checked = files.filter((f) => f === 'tests/code-docs.test.js' || !ru.isPending(f));
  const missing = checked.filter((f) => !map.headerOf(fs.readFileSync(path.join(root, f), 'utf8')));
  assert.deepEqual(missing, []);
});

test('repo: every PENDING entry still matches a file', () => {
  const modules = map.listModules(root);
  const scope = ru.scopeFiles(root);
  assert.deepEqual(map.PENDING.filter((e) => !modules.some((f) => ru.isPending(f, [e]))), [], 'stale entries in tools/code-map.mjs');
  assert.deepEqual(ru.PENDING.filter((e) => !scope.some((f) => ru.isPending(f, [e]))), [], 'stale entries in tools/ru-comments.mjs');
});
