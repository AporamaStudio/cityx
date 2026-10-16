import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// 只收集网页运行文件；用提交号更新资源地址，避免手机沿用旧版缓存。
const root = fileURLToPath(new URL('../', import.meta.url));
const output = join(root, '.pages-dist');
const revision = execFileSync('git', ['rev-parse', '--short=12', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
// 源目录均为网页运行模块；自动收集，避免3D拆分模块遗漏导致加载界面无法完成。
const runtimeFiles=(await readdir(join(root,'src'))).filter(name=>/\.(js|css)$/.test(name)).map(name=>'src/'+name);
const files=['index.html','style.css','map-preview.html','model-preview.html',...runtimeFiles];
await rm(output, { recursive: true, force: true });
for (const file of files) {
  let content = await readFile(join(root, file), 'utf8');
  content = content.replace(/\?v=[\w.-]+/g, `?v=${revision}`);
  if (file === 'index.html') {
    content = content.replace('</head>', '<meta name="robots" content="noindex"></head>');
    content = content.replace('</footer>', `<span>版本 ${revision}</span></footer>`);
  }
  const target = join(output, file);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, content);
}
await cp(join(root, 'assets/model-preview'), join(output, 'assets/model-preview'), {recursive:true});
await writeFile(join(output, '.nojekyll'), '');
console.log(`Pages 文件已生成：${output}（${revision}）`);
