import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {QUALITY_POIS} from '../src/model-preview-pois.js';

for(const asset of QUALITY_POIS){
  test(`${asset.name}三态具有同址米制源文件、内嵌PBR和六张实际渲染`,()=>{
    let landmarks;
    for(const state of ['abandoned','intact','connected']){
      const base=new URL(`../assets/model-preview/${asset.id}-quality/${asset.id}-${state}`,import.meta.url);
      const bytes=readFileSync(new URL(base+'.glb'));
      assert.equal(bytes.readUInt32LE(0),0x46546c67);assert.equal(bytes.readUInt32LE(8),bytes.length);
      const doc=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString());
      const extras=doc.nodes.find(n=>n.extras?.poiAsset)?.extras;
      assert.equal(extras.poiAsset,asset.id);assert.equal(extras.poiState,state);
      assert.equal(extras.visualOnly,true);assert.equal(extras.units,'meters');assert.deepEqual(extras.footprintMeters,asset.footprint);
      if(landmarks)assert.deepEqual(extras.landmarks,landmarks);else landmarks=extras.landmarks;
      assert.ok(doc.materials.some(m=>m.normalTexture));assert.ok(doc.images.length>0);
      for(const image of doc.images){assert.equal(image.uri,undefined);assert.ok(Number.isInteger(image.bufferView));}
      for(const mat of doc.materials)assert.ok(!mat.emissiveFactor||mat.emissiveFactor.every(v=>v===0));
      if(state==='connected'){
        assert.ok(extras.poiLights.length>0);
        assert.ok(doc.materials.some(m=>m.extras?.poiNightStrength>0));
        if(asset.id==='athletics'){assert.equal(extras.poiSpotLights.length,4);for(const light of extras.poiSpotLights){assert.equal(light.length,9);assert.ok(light.every(Number.isFinite));assert.ok(light[1]>light[4]);assert.ok(light[8]>0&&light[8]<Math.PI/2);}}
      }else assert.equal(extras.poiLights.length,0);
      assert.equal(Boolean(extras.condition),state==='abandoned');
      const blend=readFileSync(new URL(base+'.blend'));
      assert.ok(blend.subarray(0,7).toString()==='BLENDER'||blend.readUInt32LE(0)===0xfd2fb528);
      for(const period of ['day','night']){
        const png=readFileSync(new URL(`../assets/model-preview/${asset.id}-quality/renders/${asset.id}-${state}-${period}.png`,import.meta.url));
        assert.equal(png.subarray(1,4).toString(),'PNG');assert.ok(png.readUInt32BE(16)>=1440);
      }
    }
  });
}
