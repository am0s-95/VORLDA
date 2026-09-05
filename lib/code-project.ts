export type CodeFile = { path: string; encoding: 'utf8' | 'base64'; content: string };
export type CodeTask = { id: string; command: string[]; dependsOn: string[]; cwd: string };
export type CodeProject = { version: 1; files: CodeFile[]; tasks: CodeTask[] };
export const CODE_BYTES = 2_000_000;
export const CODE_FILES = 400;
const enc = new TextEncoder();
export function codePath(path: string) {
  if (typeof path !== 'string' || !path || path.length > 240 || /[\\:*?"<>|\u0000-\u001f\u007f]/.test(path) || path.split('/').some(p => !p || p === '.' || p === '..' || /[. ]$/.test(p) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i.test(p))) throw Error('Unsafe or non-portable file path.');
  return path;
}
export function excludedCodePath(path: string) {
  return path.split('/').some(p => ['.git', 'node_modules', '__pycache__', '.venv', 'venv', '__macosx'].includes(p.toLowerCase()) || /^\.env(?:\.|$)/i.test(p) && !/^\.env\.(example|sample|template)$/i.test(p) || /^(id_rsa|id_ed25519|credentials\.json)$/i.test(p) || /\.(pem|key|p12|pfx)$/i.test(p));
}
export function fileBytes(file: CodeFile): Uint8Array {
  if (file.encoding === 'utf8') return enc.encode(file.content);
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(file.content)) throw Error('Invalid binary file encoding.');
  return Uint8Array.from(atob(file.content), c => c.charCodeAt(0));
}
export function encodeCodeFile(path: string, bytes: Uint8Array): CodeFile {
  codePath(path);
  try { const content = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes); if (content.includes('\0')) throw Error(); return { path, encoding: 'utf8', content }; }
  catch { let raw = ''; for (let i = 0; i < bytes.length; i += 8192) raw += String.fromCharCode(...bytes.subarray(i, i + 8192)); return { path, encoding: 'base64', content: btoa(raw) }; }
}
export function validateCodeProject(value: unknown): CodeProject {
  const p = value as CodeProject;
  if (!p || p.version !== 1 || !Array.isArray(p.files) || p.files.length > CODE_FILES || !Array.isArray(p.tasks) || p.tasks.length > 40) throw Error('Unsupported code project or file/task limit exceeded.');
  const seen = new Set<string>(); let total = 0;
  const files = p.files.map(f => {
    codePath(f.path); const key = f.path.normalize('NFC').toLowerCase();
    if (seen.has(key) || excludedCodePath(f.path)) throw Error('Duplicate path or private/generated file is not allowed.');
    seen.add(key);
    if (!['utf8', 'base64'].includes(f.encoding) || typeof f.content !== 'string' || f.content.length > CODE_BYTES * 2) throw Error('Invalid or oversized source file.');
    total += fileBytes(f).byteLength; if (total > CODE_BYTES) throw Error('Code workspace supports up to 2 MB of source. Exclude dependencies and split larger projects.');
    return { path: f.path, encoding: f.encoding, content: f.content };
  });
  for (const key of seen) { const parts = key.split('/'); parts.pop(); while (parts.length) { if (seen.has(parts.join('/'))) throw Error('File and directory paths conflict.'); parts.pop(); } }
  const ids = new Set<string>();
  const tasks = p.tasks.map(t => {
    if (!/^[a-zA-Z0-9_-]{1,50}$/.test(t.id) || ids.has(t.id) || !Array.isArray(t.command) || t.command.length < 1 || t.command.length > 40 || t.command.some(x => typeof x !== 'string' || !x || x.length > 1000 || /[\u0000\r\n]/.test(x)) || !Array.isArray(t.dependsOn) || t.dependsOn.length > 40 || typeof t.cwd !== 'string') throw Error('Invalid build task. Use command arguments, a unique ID and dependency IDs.');
    if (t.cwd) codePath(t.cwd); ids.add(t.id);
    return { id: t.id, command: [...t.command], dependsOn: [...new Set(t.dependsOn)], cwd: t.cwd };
  });
  const active = new Set<string>(), done = new Set<string>();
  function visit(id: string) { if (active.has(id)) throw Error('Task dependencies contain a cycle.'); if (done.has(id)) return; const task = tasks.find(t => t.id === id); if (!task) throw Error('A task dependency is missing.'); active.add(id); task.dependsOn.forEach(visit); active.delete(id); done.add(id); }
  tasks.forEach(t => visit(t.id));
  return { version: 1, files, tasks };
}

const languages: Record<string, string> = { js: 'JavaScript', mjs: 'JavaScript', cjs: 'JavaScript', ts: 'TypeScript', tsx: 'TypeScript / JSX', jsx: 'JavaScript / JSX', html: 'HTML', css: 'CSS', vue: 'Vue', svelte: 'Svelte', py: 'Python', go: 'Go', rs: 'Rust', java: 'Java', kt: 'Kotlin', cs: 'C#', php: 'PHP', rb: 'Ruby', c: 'C', h: 'C/C++', cpp: 'C++', swift: 'Swift', dart: 'Dart', sql: 'SQL', sh: 'Shell', ps1: 'PowerShell', json: 'JSON', yaml: 'YAML', yml: 'YAML' };
export function analyzeCodeProject(project: CodeProject) {
  const stacks: { root: string; name: string; requirement: string }[] = [], warnings: string[] = [], tasks: CodeTask[] = [];
  const detected = new Set<string>();
  for (const f of project.files) {
    const ext = f.path.split('.').pop()!.toLowerCase(); if (languages[ext]) detected.add(languages[ext]);
    const name = f.path.split('/').pop()!, root = f.path.slice(0, -(name.length + 1));
    if (name === 'package.json' && f.encoding === 'utf8') {
      try {
        const pkg = JSON.parse(f.content), deps = { ...pkg.dependencies, ...pkg.devDependencies };
        const frameworks = ['next', 'react', 'vue', 'nuxt', 'svelte', '@angular/core', 'express', 'vite', 'n8n', 'node-red'].filter(k => Object.hasOwn(deps, k));
        const manager = typeof pkg.packageManager === 'string' && /^(npm|pnpm|yarn)@/.test(pkg.packageManager) ? pkg.packageManager.split('@')[0] : project.files.some(x => x.path === (root ? root + '/' : '') + 'pnpm-lock.yaml') ? 'pnpm' : project.files.some(x => x.path === (root ? root + '/' : '') + 'yarn.lock') ? 'yarn' : 'npm';
        stacks.push({ root, name: frameworks.join(' + ') || 'Node.js', requirement: `Node.js ${typeof pkg.engines?.node === 'string' ? pkg.engines.node : '(version not declared)'} · ${manager}` });
        for (const k of ['build', 'test', 'dev', 'start']) if (typeof pkg.scripts?.[k] === 'string') tasks.push({ id: `node-${tasks.length + 1}-${k}`, command: [manager, 'run', k], dependsOn: [], cwd: root });
        if (Object.keys(deps).some(k => ['sharp', 'sqlite3', 'better-sqlite3', 'node-gyp', 'canvas', 'onnxruntime-node'].includes(k)) || pkg.os || pkg.cpu) warnings.push(`${f.path}: native dependencies or OS/CPU restrictions require a target-machine build.`);
      } catch { warnings.push(`${f.path}: invalid package.json.`); }
    }
    const manifests: Record<string, [string, string]> = { 'pyproject.toml': ['Python', 'Python + declared environment/dependencies'], 'requirements.txt': ['Python', 'Python + pip requirements'], 'go.mod': ['Go', 'Go toolchain; check go.mod version'], 'Cargo.toml': ['Rust', 'Rust/Cargo toolchain'], 'pom.xml': ['Java', 'JDK + Maven'], 'build.gradle': ['JVM', 'JDK + Gradle'], 'composer.json': ['PHP', 'PHP + Composer'], 'Gemfile': ['Ruby', 'Ruby + Bundler'], 'CMakeLists.txt': ['C / C++', 'CMake + target compiler'], 'pubspec.yaml': ['Dart / Flutter', 'Dart/Flutter SDK + platform build tools'], 'Package.swift': ['Swift', 'Swift toolchain; Apple targets need Apple build tools'], 'Dockerfile': ['Container', 'Container runtime; image architecture must match target'] };
    if (manifests[name]) stacks.push({ root, name: manifests[name][0], requirement: manifests[name][1] });
    if (name.endsWith('.csproj')) stacks.push({ root, name: '.NET', requirement: '.NET SDK matching TargetFramework' });
    if (/\.(node|dll|exe|so|dylib)$/i.test(name)) warnings.push(`${f.path}: binary portability is not verified.`);
  }
  if (!stacks.length && project.files.some(f => /\.html?$/i.test(f.path))) stacks.push({ root: '', name: 'Static web', requirement: 'Browser; external resources may need a server' });
  if (!stacks.some(s => s.name === 'Python') && detected.has('Python')) stacks.push({ root: '', name: 'Python', requirement: 'Python interpreter; version/dependency manifest not detected' });
  if (!stacks.some(s => s.name === 'C / C++') && (detected.has('C') || detected.has('C++'))) stacks.push({ root: '', name: 'C / C++', requirement: 'Target compiler and ABI; sample tasks use GCC on Linux/Unix' });
  return { languages: [...detected].sort(), stacks, warnings, tasks };
}

export function codeExportFiles(project: CodeProject, runner: string) {
  const p = validateCodeProject(project);
  if (p.files.some(f => (f.path.toLowerCase() === 'vorlda-tools' || f.path.toLowerCase().startsWith('vorlda-tools/')))) throw Error('Rename the existing vorlda-tools directory before adding export tools.');
  const info = analyzeCodeProject(p);
  return [...p.files.map(f => ({ name: f.path, content: fileBytes(f) })),
    { name: 'vorlda-tools/manifest.json', content: JSON.stringify({ ...p, files: p.files.map(f => ({ path: f.path, encoding: f.encoding })), compatibility: info }, null, 2) },
    { name: 'vorlda-tools/run.mjs', content: runner },
    { name: 'vorlda-tools/README.md', content: '# Source project\n\nYour source files are preserved byte-for-byte. Install the runtime/dependencies declared by this project. Opening code here does not prove every OS/CPU is supported.\n\nView the task graph: node vorlda-tools/run.mjs plan\nRun a reviewed task: node vorlda-tools/run.mjs run TASK_ID --allow-commands\nOptional concurrency: --parallel=2 (1–4). Long-running tasks have a 120-second deadline.\n\nThe runner is an operator tool, NOT a security sandbox. Run trusted code only in your own isolated environment. Commands may install packages, access the network or modify files. Never include production credentials in an imported source archive.\n\nKeep vorlda-tools/manifest.json with the source when reimporting to restore task dependencies. No code is executed during import or analysis. Browser preview supports a single self-contained HTML file; framework builds and servers require their runtimes.\n' }];
}
