import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// 只收集网页运行文件；用提交号更新资源地址，避免手机沿用旧版缓存。
const root = fileURLToPath(new URL('../', import.meta.url));
const output = join(root, '.pages-dist');
const revision = execFileSync('git', ['rev-parse', '--short=12', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const files = ['index.html', 'style.css', 'map-preview.html', 'model-preview.html', 'src/model-preview.js', 'src/model-preview.css', 'src/model-preview-effects.js', 'src/app.js', 'src/city-3d.js', 'src/city-building-style.js', 'src/city-wrecks.js', 'src/city-roads.js', 'src/city-road-model.js', 'src/city-view.js', 'src/city-observation.js', 'src/city-effects.js', 'src/city-streets.js', 'src/city-facilities.js', 'src/combat-visuals.js', 'src/model.js', 'src/config.js', 'src/enemy-sources.js', 'src/audio.js', 'src/map-camera.js', 'src/control-border.js', 'src/city-map.js', 'src/map-settings.js', 'src/map-preview.js', 'src/city-textures.js', 'src/fog.js', 'src/visibility.js', 'src/icons.js', 'src/tower-overlay.js', 'src/render-meter.js'];
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
