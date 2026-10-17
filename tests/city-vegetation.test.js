import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyLandPlants} from '../src/city-vegetation.js';
import {generateCityMap} from '../src/city-map.js';
import {naturalPlants} from '../src/natural-terrain.js';
import {surroundingLandscape} from '../src/city-surroundings.js';
import {MAP_DEFAULTS as LARGE_MAP_DEFAULTS} from '../src/map-settings.js';
const MAP_DEFAULTS={...LARGE_MAP_DEFAULTS,width:60,height:60,landmarks:false};
import {DEFAULTS} from '../src/config.js';
import {createCampaign,buildProduction,plotContent,key,funds,economyBuildQuote} from '../src/model.js';

const plot={id:606,x:6,y:6,w:6,h:6,kind:'open',status:'empty'};
const options={width:60,cellMeters:20,visible:()=>true,occupied:new Set()};

test('普通空地、自然公园和外围共用同树种米制范围，不把窄冠/幼树放大到成年宽冠尺寸',()=>{
  const map=generateCityMap(MAP_DEFAULTS),limits={broad:6.6,column:3.6,young:2.9,round:2.7,wild:2.2,dead:3.2};
  for(const cellMeters of [20,40])for(const plants of [emptyLandPlants([plot],{...options,cellMeters}),naturalPlants(map,cellMeters),surroundingLandscape(map).trees]){
    assert.ok(plants.length);
    for(const p of plants){const meters=p.width??p.w*cellMeters;assert.ok(meters>=limits[p.asset]*.85-1e-8&&meters<=limits[p.asset]+1e-8);}
  }
});

test('植被稳定、边缘多样且米制树冠完整留在原空地',()=>{
  const plants=emptyLandPlants([plot],options);assert.ok(plants.length>10);assert.deepEqual(plants,emptyLandPlants([plot],options));
  assert.ok(new Set(plants.map(p=>p.asset)).size>=4);
  for(const p of plants){const r=p.w/Math.SQRT2;assert.ok(p.x-r>=plot.x&&p.x+r<=plot.x+plot.w&&p.y-r>=plot.y&&p.y+r<=plot.y+plot.h);assert.ok(p.w*20<=6.6);}
});

test('建成、营地与清理后的废墟不生成植物；装饰不修改输入',()=>{
  const before=structuredClone(plot);
  for(const override of [{status:'building'},{kind:'building'},{role:'camp'}])assert.deepEqual(emptyLandPlants([{...plot,...override}],options),[]);
  emptyLandPlants([plot],options);assert.deepEqual(plot,before);assert.equal(options.occupied.size,0);
});

test('树冠涉及的未知或占用格均不能放置，视野变化不移动剩余树木',()=>{
  const all=emptyLandPlants([plot],options),hidden=7*60+7;
  const plants=emptyLandPlants([plot],{...options,visible:id=>id!==hidden,occupied:new Set([8*60+8])});
  for(const p of plants){assert.deepEqual(p,all.find(a=>a.id===p.id));const r=p.w/Math.SQRT2;
    for(let y=Math.floor(p.y-r);y<=Math.floor(p.y+r);y++)for(let x=Math.floor(p.x-r);x<=Math.floor(p.x+r);x++)assert.ok(![hidden,8*60+8].includes(y*60+x));
  }
  assert.deepEqual(emptyLandPlants([plot],{...options,visible:()=>false}),[]);
});

test('原地图原生空地建成后移除植物，装饰不影响建设报价与金币',()=>{
  const layout=generateCityMap({width:60,height:60,seed:'cityx-01'}),state=createCampaign({...DEFAULTS,budget:10000,initialPopulation:1000,controlRadius:60},undefined,layout);
  state.day=3;const site=state.sites.find(p=>p.kind==='open'&&p.role!=='camp'&&(p.width??p.size)>=2),id=key(site.x,site.y);
  const describe=()=>({...site,id,w:site.width??site.size,h:site.height??site.size,status:plotContent(state,id).status});
  assert.ok(emptyLandPlants([describe()],options).length);const gold=funds(state),quote=economyBuildQuote(state,id,'production');
  assert.equal(buildProduction(state,id),'');assert.equal(funds(state),gold-quote.cost);assert.equal(plotContent(state,id).status,'building');
  assert.deepEqual(emptyLandPlants([describe()],options),[]);
});
