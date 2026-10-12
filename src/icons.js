// 地图和状态栏共用同一篝火形状，避免两处示意不一致。
export function drawCampfire(ctx,x,y,size,alive=true){
  ctx.save();ctx.translate(x,y);ctx.scale(size,size);
  ctx.fillStyle=alive?'#ffc17c':'#75615b';ctx.beginPath();ctx.moveTo(.52,-.03);ctx.bezierCurveTo(.45,.38,1.03,.44,.82,.79);ctx.bezierCurveTo(.6,1.1,.08,.9,.17,.56);ctx.lineTo(.37,.24);ctx.lineTo(.37,.51);ctx.closePath();ctx.fill();
  if(alive){ctx.fillStyle='#fff1b0';ctx.beginPath();ctx.moveTo(.51,.39);ctx.lineTo(.68,.78);ctx.lineTo(.36,.78);ctx.closePath();ctx.fill();}
  ctx.restore();
}

// 敌源耐久徽记：盾牌与剩余HP并列，大小占地共用一个标签。
export function drawShield(ctx,x,y,size){
  ctx.save();ctx.translate(x,y);ctx.scale(size,size);ctx.fillStyle='#f9d9be';ctx.strokeStyle='#9a6554';ctx.lineWidth=.08;
  ctx.beginPath();ctx.moveTo(.5,.04);ctx.lineTo(.92,.20);ctx.lineTo(.86,.62);ctx.quadraticCurveTo(.75,.88,.5,.98);ctx.quadraticCurveTo(.25,.88,.14,.62);ctx.lineTo(.08,.20);ctx.closePath();ctx.fill();ctx.stroke();
  ctx.beginPath();ctx.moveTo(.5,.19);ctx.lineTo(.5,.79);ctx.stroke();ctx.restore();
}

// 破裂徽记和碎片表示敌源已摧毁，与任务完成的对号区分。
export const SOURCE_DESTROYED_SVG='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 2 3 5l1 8 5 5 2-6-3-3 4-3zM15 3l6 2-1 8-6 7-2-5 3-4-2-3zM3 19l4 1-2 3zM19 18l3 3-4 1z" fill="currentColor"/></svg>';
// 圆圈斜杠表示出兵被阻止，不与已击杀的叉号混用。
export const SPAWN_BLOCKED_SVG='<svg viewBox="0 0 24 24" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="m6 6 12 12"/></g></svg>';

// 群体代表城市人口，戴帽单人代表可分配工人；资源栏、报价和地图共用。
export const POPULATION_SVG='<svg viewBox="0 0 32 32" aria-hidden="true"><g fill="currentColor" opacity=".55"><circle cx="6" cy="11" r="4"/><circle cx="26" cy="11" r="4"/><path d="M0 29v-8a6 6 0 0 1 12 0v8zm20 0v-8a6 6 0 0 1 12 0v8z"/></g><g fill="currentColor"><circle cx="16" cy="8" r="5"/><path d="M7 29v-8a9 9 0 0 1 18 0v8z"/></g></svg>';
export const WORKER_SVG='<svg viewBox="0 0 32 32" aria-hidden="true"><g fill="currentColor"><circle cx="16" cy="12" r="5"/><path d="M5 29v-6a11 11 0 0 1 22 0v6zM9 9a7 7 0 0 1 14 0z"/></g><path d="M8 9h16M16 2v5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
// 建设图标只定义一次；按钮、手册和地图缓存图片共用轮廓，昼夜仅改变颜色。
const facilityPaths={
  near:'<path d="M10 4h4v12h-4zm8 0h4v12h-4z" fill="currentColor"/><rect x="6" y="13" width="20" height="13" rx="4" fill="currentColor" fill-opacity=".22" stroke="currentColor" stroke-width="2.5"/><circle cx="16" cy="20" r="3" fill="currentColor"/><path d="M4 29h24" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>',
  far:'<path d="M14 3h4v16h-4zm-2-2h8v4h-8z" fill="currentColor"/><circle cx="16" cy="20" r="6" fill="currentColor" fill-opacity=".22" stroke="currentColor" stroke-width="2.5"/><path d="m12 24-6 5m14-5 6 5M5 29h22" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>',
  wall:'<rect x="3" y="7" width="26" height="22" rx="2" fill="currentColor" fill-opacity=".22" stroke="currentColor" stroke-width="2.5"/><path d="M3 14h26M3 22h26M16 7v7M10 14v8m12-8v8m-6 0v7M4 4h24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  production:'<path d="M3 29V15l9-6v6l9-6v6h3V3h5v26zM6 21v4h4v-4zm8 0v4h4v-4z" fill="currentColor" fill-rule="evenodd"/><path d="M25 7h3" stroke="currentColor" stroke-width="2"/>',
  housing:'<path d="m2 15 14-12 14 12" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M6 14v15h20V14L16 6zM10 17v5h5v-5zm9 4v8h4v-8z" fill="currentColor" fill-rule="evenodd"/>',
  watch:'<path d="M9 29 12 13h8l3 16M11 21l11 8M21 21l-11 8" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/><path d="M6 12h20v4H6zM5 9 16 2 27 9z" fill="currentColor"/><path d="M10 9v3m12-3v3" stroke="currentColor" stroke-width="2"/>'
};
export const FACILITY_COLORS={near:['#28654f','#a0e7c3'],far:['#575487','#d2c2fa'],wall:['#62634c','#d9d0af'],production:['#346970','#a1d9d7'],housing:['#89582d','#efc18c'],watch:['#245d73','#b3e8f2']};
export const FACILITY_SVGS=Object.fromEntries(Object.entries(facilityPaths).map(([name,path])=>[name,`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32" class="facility-icon${['near','far'].includes(name)?' weapon-icon':''}" data-facility="${name}" style="--icon-day:${FACILITY_COLORS[name][0]};--icon-night:${FACILITY_COLORS[name][1]}" aria-hidden="true">${path}</svg>`]));
// 保留瞭望塔入口，形状与其它设施一样由共享图标表提供。
export const WATCHTOWER_SVG=FACILITY_SVGS.watch;
