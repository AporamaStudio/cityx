import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from '../assets/model-preview/vendor/three/build/three.module.js';

// 运行真实Three对象与动效代码，仅替换浏览器import map地址。
const urls=new Map(),three=new URL('../assets/model-preview/vendor/three/build/three.module.js',import.meta.url).href;
async function moduleURL(url){
  if(urls.has(url))return urls.get(url);
  let source=(await readFile(new URL(url),'utf8')).replaceAll("from 'three'",`from '${three}'`);
  const dependencies=[...source.replace(/\/\*[\s\S]*?\*\//g,'').matchAll(/from '(\.\/[^']+|three\/addons\/[^']+)'/g)];
  for(const [statement,path] of dependencies){
    const dependency=path.startsWith('.')?new URL(path,url):new URL('../assets/model-preview/vendor/three/examples/jsm/'+path.slice('three/addons/'.length),import.meta.url);
    dependency.search='';source=source.replace(statement,`from '${await moduleURL(dependency.href)}'`);
  }
  const result='data:text/javascript;base64,'+Buffer.from(source).toString('base64');urls.set(url,result);return result;
}
const load=name=>moduleURL(new URL('../src/'+name,import.meta.url).href).then(url=>import(url));

test('灯槽按实际设施增长、离开后保留零强度且复用，新地图完整释放',async()=>{
  const {createCityLightSlots}=await load('city-light-slots.js'),scene=new THREE.Scene(),slots=createCityLightSlots(scene);
  const list=[{id:'camp',asset:'camp'},{id:'wreck',asset:'wreck'},{id:'watch',asset:'watch'}];
  const assigned=slots.sync(list),fire=assigned.get('camp').light,watch=assigned.get('watch').light;
  assert.deepEqual(slots.stats(),{fireLights:2,watchLights:1});assert.equal(scene.children.filter(n=>n.isLight).length,3);
  fire.intensity=19;watch.intensity=85;slots.sync([]);
  assert.equal(fire.visible,true);assert.equal(fire.intensity,0);assert.equal(watch.visible,true);assert.equal(watch.intensity,0);assert.equal(slots.lights().length,3);
  const reused=slots.sync([{id:'newFire',asset:'camp'},{id:'newWatch',asset:'watch'}]);
  assert.equal(reused.get('newFire').light,fire);assert.equal(reused.get('newWatch').light,watch);assert.equal(watch.castShadow,false);
  slots.reset();assert.equal(scene.children.length,0);assert.equal(slots.lights().length,0);assert.deepEqual(slots.stats(),{fireLights:0,watchLights:0});
});

test('跨视口/昼夜不改灯数，保留火光、前线扫光和后方暖灯的真实参数',async()=>{
  const previous=globalThis.document;globalThis.document={createElement:()=>({getContext:()=>({createRadialGradient:()=>({addColorStop(){}}),fillRect(){}})})};
  try{
    const {createCityEffects}=await load('city-effects.js'),scene=new THREE.Scene(),effects=createCityEffects(scene);
    const camp={id:'camp',asset:'camp',x:4,y:4,height:.2,w:.15,h:.15,fireScale:.15/1.3},wreck={id:'wreck',asset:'wreck',x:5,y:4,height:.1,w:.2,h:.1,fireScale:.2},watch={id:'watch',asset:'watch',x:3,y:3,height:.8,w:.26,h:.26,target:{x:6,y:5}};
    const near={left:0,right:10,top:0,bottom:10},far={left:100,right:110,top:100,bottom:110};
    effects.updateLights([camp,wreck,watch],0,1,near);
    const all=effects.nightLights(),point=all[0],spot=all[2],power=point.intensity;
    assert.equal(all.length,3);assert.equal(spot.isSpotLight,true);assert.equal(spot.intensity,85);assert.equal(spot.distance,24);assert.equal(spot.angle,.10);assert.equal(spot.color.getHexString(),'9fcaff');assert.deepEqual(spot.target.position.toArray(),[6,.01,5]);
    effects.updateLights([camp,wreck,watch],0,1,far);assert.equal(point.intensity,0);assert.equal(spot.intensity,0);assert.ok(all.every(light=>light.visible));assert.equal(scene.children.filter(n=>n.isLight).length,3);
    effects.updateLights([camp,wreck,watch],0,1,near);assert.equal(point.intensity,power);assert.equal(spot.intensity,85);
    effects.updateLights([camp,wreck,{...watch,target:null}],0,1,near);assert.equal(spot.color.getHexString(),'ffd599');assert.equal(spot.intensity,1.1);assert.equal(spot.distance,watch.w*4);
    effects.updateLights([camp,wreck,watch],0,0,near);assert.equal(spot.intensity,0);assert.ok(point.intensity>0);assert.ok(all.every(light=>light.visible));
    effects.updateLights([],0,1,near);assert.ok(all.every(light=>light.intensity===0));assert.equal(effects.group.children.length,0);
    effects.resetLights();assert.equal(effects.nightLights().length,0);
  }finally{globalThis.document=previous;}
});

test('零人数实例已具备真实颜色属性，预热不会创建敌人或改变首次出现后的材质结构',async()=>{
  const {createZombieCrowds}=await load('city-enemies.js'),parent=new THREE.Group(),crowds=createZombieCrowds(parent,32);
  const body=crowds.group.children.find(node=>node.material.isMeshStandardMaterial),color=body.instanceColor;
  assert.equal(crowds.stats().figures,0);assert.ok(crowds.group.children.every(node=>node.count===0));assert.ok(color);assert.deepEqual([...color.array.slice(0,3)],[1,1,1]);
  const fx={time:0,night:1,reducedMotion:true,enemyFiguresPerGroup:3};
  crowds.update([{id:'shown',x:1,y:1,cellMeters:20,members:1,health:1}],fx);assert.equal(crowds.stats().figures,3);assert.equal(body.instanceColor,color);assert.equal(body.material.userData.cityEnemyNight.value,1);
  crowds.update([],fx);assert.equal(crowds.stats().figures,0);assert.equal(body.instanceColor,color);
});
