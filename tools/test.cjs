'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const creator = process.env.COCOS_CREATOR_HOME || 'D:/_Cocos Games/Creator/3.8.8';
const ts = require(path.join(creator, 'resources/app.asar.unpacked/node_modules/typescript'));
const destination = path.join(root, '.test-build');
function compile(dir) {
  if (!fs.existsSync(dir)) return;
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, item.name);
    if (item.isDirectory()) compile(file);
    else if (item.name.endsWith('.ts') && !item.name.endsWith('.d.ts')) {
      const source = fs.readFileSync(file, 'utf8');
      if (/from\s+['"]cc['"]/.test(source)) throw new Error('Engine dependency in pure test module: ' + file);
      const result = ts.transpileModule(source, {fileName: file, reportDiagnostics: true, compilerOptions: {target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, esModuleInterop: true, strict: true}});
      const errors = (result.diagnostics || []).filter(d => d.category === ts.DiagnosticCategory.Error);
      if (errors.length) throw new Error(ts.formatDiagnosticsWithColorAndContext(errors, {getCurrentDirectory:()=>root,getCanonicalFileName:f=>f,getNewLine:()=> '\n'}));
      const output = path.join(destination, path.relative(path.join(root,'assets/scripts'),file).replace(/\.ts$/,'.js'));
      fs.mkdirSync(path.dirname(output),{recursive:true}); fs.writeFileSync(output,result.outputText);
    }
  }
}
for (const folder of ['domain','platform']) compile(path.join(root,'assets/scripts',folder));
fs.mkdirSync(destination,{recursive:true});
fs.writeFileSync(path.join(destination,'package.json'),'{"type":"commonjs"}\n');
if (process.argv.includes('--compile-only')) process.exit(0);
const tests = fs.readdirSync(path.join(root,'tests')).filter(f=>f.endsWith('.test.cjs')).sort().map(f=>path.join(root,'tests',f));
if (!tests.length) throw new Error('No tests/*.test.cjs found');
const result = spawnSync(process.execPath,['--test',...tests,...process.argv.slice(2)],{cwd:root,stdio:'inherit'});
process.exit(result.status ?? 1);
