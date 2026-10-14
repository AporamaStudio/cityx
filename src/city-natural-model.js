import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {hillHeight,lakeOutline,naturalPlants} from './natural-terrain.js?v=3';

// 河面、岸带和桥梁共用少量材质合批；尺度以米转格，不增加独立光源或阴影贴图。
export function createNaturalModel(layout,cellMeters=20,models=new Map()){
  const root=new THREE.Group(),batches=new Map(),natural=layout.natural;
  if(!natural?.river)return root;
  const add=(geometry,color)=>{
    // 程序地面与GLB树木只合并同一组位置/法线属性，避免索引和UV差异破坏合批。
    if(geometry.index){const plain=geometry.toNonIndexed();geometry.dispose();geometry=plain;}
    for(const name of Object.keys(geometry.attributes))if(!['position','normal'].includes(name))geometry.deleteAttribute(name);
    if(!batches.has(color))batches.set(color,[]);batches.get(color).push(geometry);
  };
  const quad=(a,b,c,d,color)=>{
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute([...a,...b,...c,...c,...b,...d],3));geometry.computeVertexNormals();add(geometry,color);
  };
  const box=(x,y,z,w,h,d,color)=>{const geometry=new THREE.BoxGeometry(w,h,d);geometry.translate(x,y,z);add(geometry,color);};
  for(const r of natural.regions)quad([r.x,.001,r.y],[r.x,.001,r.y+r.h],[r.x+r.w,.001,r.y],[r.x+r.w,.001,r.y+r.h],'#7d8d67');
  const river=natural.river,points=river.points,shore=.7/cellMeters,fringe=3/cellMeters;
  for(let i=0;i<points.length-1;i++){
    const a=points[i],b=points[i+1];
    quad([a.x,.002,a.top],[a.x,.002,a.bottom],[b.x,.002,b.top],[b.x,.002,b.bottom],'#528592');
    for(const edge of ['top','bottom']){
      const sign=edge==='top'?-1:1;
      quad([a.x,.002,a[edge]],[a.x,.006,a[edge]+sign*shore],[b.x,.002,b[edge]],[b.x,.006,b[edge]+sign*shore],'#b7b094');
      quad([a.x,.006,a[edge]+sign*shore],[a.x,.001,a[edge]+sign*(shore+fringe)],[b.x,.006,b[edge]+sign*shore],[b.x,.001,b[edge]+sign*(shore+fringe)],'#869376');
    }
  }
  for(const bridge of natural.bridges){
    const {x,y,w,h}=bridge,deck=.8/cellMeters;
    box(x+w/2,deck-.3/cellMeters,y+h/2,w,.6/cellMeters,h,'#84887d');
    for(const side of [x+.08/cellMeters,x+w-.08/cellMeters]){
      box(side,deck+1/cellMeters,y+h/2,.16/cellMeters,.2/cellMeters,h,'#b5b09c');
      for(let z=y;z<=y+h;z+=2.5/cellMeters)box(side,deck+.5/cellMeters,z,.2/cellMeters,1/cellMeters,.2/cellMeters,'#9a9c8c');
    }
  }
  for(const lake of natural.lakes){
    const outline=lakeOutline(lake);
    for(let i=0;i<outline.length;i++){
      const a=outline[i],b=outline[(i+1)%outline.length],geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute([lake.cx,.002,lake.cy,a.x,.002,a.y,b.x,.002,b.y],3));geometry.computeVertexNormals();add(geometry,'#528592');
      const edge=p=>[p.x+(p.x-lake.cx)/lake.rx*1.6/cellMeters,.006,p.y+(p.y-lake.cy)/lake.ry*1.6/cellMeters];
      quad([a.x,.002,a.y],edge(a),[b.x,.002,b.y],edge(b),'#b7b094');
    }
  }
  for(const hill of natural.hills)for(let y=hill.y;y<hill.y+hill.h;y+=.25)for(let x=hill.x;x<hill.x+hill.w;x+=.25){
    const p=(x,y)=>[x,.001+hillHeight(hill,x,y,cellMeters),y];quad(p(x,y),p(x,y+.25),p(x+.25,y),p(x+.25,y+.25),'#809269');
  }
  for(const plant of naturalPlants(layout,cellMeters)){
    const model=models.get(plant.asset);if(!model)continue;
    const bounds=new THREE.Box3().setFromObject(model),size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3()),scale=plant.w/Math.max(size.x,size.z);
    const matrix=new THREE.Matrix4().makeTranslation(plant.x,plant.ground,plant.y).multiply(new THREE.Matrix4().makeRotationY(plant.angle)).multiply(new THREE.Matrix4().makeScale(scale,scale,scale)).multiply(new THREE.Matrix4().makeTranslation(-center.x,-bounds.min.y,-center.z));
    model.updateMatrixWorld(true);model.traverse(node=>{if(node.isMesh)add(node.geometry.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(matrix,node.matrixWorld)),node.material.color.getHexString());});
  }
  for(const [color,list] of batches){
    const geometry=mergeGeometries(list,false);list.forEach(g=>g.dispose());
    const material=new THREE.MeshStandardMaterial({color:color.startsWith('#')?color:'#'+color,roughness:color==='#528592'?.42:1,side:THREE.DoubleSide});
    const mesh=new THREE.Mesh(geometry,material);mesh.receiveShadow=true;mesh.castShadow=!color.startsWith('#')||color==='#809269';mesh.userData.ownGeometry=true;mesh.userData.cityDecoration=true;root.add(mesh);
  }
  return root;
}
