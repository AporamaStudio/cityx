import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// 只收集网页运行文件；用提交号更新资源地址，避免手机沿用旧版缓存。
const root = fileURLToPath(new URL('../', import.meta.url));
const output = join(root, '.pages-dist');
const revision = execFileSync('git', ['rev-parse', '--short=12', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const files = ['index.html', 'style.css', 'map-preview.html', 'src/app.js', 'src/model.js', 'src/config.js', 'src/audio.js', 'src/map-camera.js', 'src/city-map.js', 'src/map-settings.js', 'src/map-preview.js', 'src/city-textures.js', 'src/fog.js', 'src/icons.js'];
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
await writeFile(join(output, '.nojekyll'), '');
console.log(`Pages 文件已生成：${output}（${revision}）`);
