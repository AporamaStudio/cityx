import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from '../assets/model-preview/vendor/three/build/three.module.js';
const source=(await readFile(new URL('../src/city-point-grid.js',import.meta.url),'utf8')).replace("'three'",JSON.stringify(new URL('../assets/model-preview/vendor/three/build/three.module.js',import.meta.url).href));
const {pointLightGrid,createCityPointGrid}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const idsAt=(grid,x,y)=>{const col=Math.floor((x-grid.x)/4),row=Math.floor((y-grid.y)/4);if(col<0||row<0||col>=grid.nx||row>=grid.ny)return [];return [...grid.data.slice((row*grid.width+col*grid.packets)*4,(row*grid.width+(col+1)*grid.packets)*4)].filter(Boolean);};

test('世界灯桶不丢任何有实际贡献的点光，重叠100盏也不截数量',()=>{
  const lights=Array.from({length:160},(_,i)=>{const light=new THREE.PointLight('#ffbb77',2,.3+i%5,2);light.position.set((i*73)%256,.2,(i*59)%256);return light;});
  const grid=pointLightGrid(lights);
  for(const [i,light] of lights.entries())for(const dx of [-.99,0,.99])for(const dy of [-.99,0,.99]){const x=light.position.x+dx*light.distance,y=light.position.z+dy*light.distance;if(Math.hypot(x-light.position.x,y-light.position.z)<light.distance)assert.ok(idsAt(grid,x,y).includes(i+1));}
  const overlap=pointLightGrid(Array.from({length:100},()=>lights[0]));assert.equal(overlap.peak,100);assert.equal(idsAt(overlap,lights[0].position.x,lights[0].position.z).length,100);
});

test('灯数据保留原位置、颜色乘光强、距离和衰减，闪烁只上传小数据而不重建桶',()=>{
  const grid=createCityPointGrid(),light=new THREE.PointLight('#ffbb77',3,2.3,2),material=new THREE.MeshStandardMaterial();light.position.set(20,.4,30);
  grid.bind(material);const shader={uniforms:{},vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader};material.onBeforeCompile(shader);grid.update([light]);
  assert.equal(light.visible,false);assert.equal(light.userData.cityPointGrid,true);assert.deepEqual(grid.stats(),{clusterLights:1,clusterPeak:1});
  const texture=shader.uniforms.cityPointIndices.value,data=shader.uniforms.cityPointData.value.image.data;
  assert.deepEqual([...data.slice(0,4)],[...new Float32Array([20,.4,30,2.3])]);assert.deepEqual([...data.slice(4,8)],[...new Float32Array([light.color.r*3,light.color.g*3,light.color.b*3,2])]);
  light.intensity=4;grid.update([light]);assert.equal(shader.uniforms.cityPointIndices.value,texture);assert.equal(data[4],Math.fround(light.color.r*4));
  assert.match(shader.fragmentShader,/getDistanceAttenuation\(length\(vector\),positionRange.w,colorDecay.a\)/);assert.match(shader.vertexShader,/instanceMatrix\*cityPointLocal/);
  grid.update([]);assert.equal(shader.uniforms.cityPointShape.value.z,0);grid.reset();assert.equal(grid.stats().clusterLights,0);
});
