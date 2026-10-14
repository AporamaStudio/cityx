import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

// 河面、岸带和桥梁共用少量材质合批；尺度以米转格，不增加独立光源或阴影贴图。
export function createNaturalModel(layout,cellMeters=20){
  const root=new THREE.Group(),batches=new Map(),natural=layout.natural;
  if(!natural?.river)return root;
  const add=(geometry,color)=>{if(!batches.has(color))batches.set(color,[]);batches.get(color).push(geometry);};
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
  for(const [color,list] of batches){
    const geometry=mergeGeometries(list,false);list.forEach(g=>g.dispose());
    const material=new THREE.MeshStandardMaterial({color,roughness:color==='#528592'?.42:1,side:THREE.DoubleSide});
    const mesh=new THREE.Mesh(geometry,material);mesh.receiveShadow=true;mesh.userData.ownGeometry=true;mesh.userData.cityDecoration=true;root.add(mesh);
  }
  return root;
}
