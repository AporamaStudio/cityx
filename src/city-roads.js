// 米制道路构件只表达街景；横断面来自原道路，不参与通行、视野或建设。
const roadGeometry=new WeakMap();
export function roadMarkings(layout){
  if(roadGeometry.has(layout))return roadGeometry.get(layout);
  const {width:w,height:h,tiles}=layout,marks=new Map();
  const road=(x,y)=>x>=0&&y>=0&&x<w&&y<h&&tiles[y*w+x]==='road';
  const span=(x,y,dx,dy)=>{let lo=0,hi=0;while(road(x+(lo-1)*dx,y+(lo-1)*dy))lo--;while(road(x+(hi+1)*dx,y+(hi+1)*dy))hi++;return {lo,hi,size:hi-lo+1};};
  for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(road(x,y)){
    const across=span(x,y,1,0),along=span(x,y,0,1);
    const vertical=across.size<=3&&along.size>3,horizontal=along.size<=3&&across.size>3;
    const section=vertical?across:horizontal?along:null;
    let crossing=0;
    if(section)for(const sign of [-1,1]){
      const nx=x+(horizontal?sign:0),ny=y+(vertical?sign:0);
      if(road(nx,ny)&&span(nx,ny,vertical?1:0,vertical?0:1).size>section.size+1)crossing=sign;
    }
    marks.set(y*w+x,{mask:(road(x,y-1)?1:0)|(road(x+1,y)?2:0)|(road(x,y+1)?4:0)|(road(x-1,y)?8:0),axis:vertical?'v':horizontal?'h':'',center:section?(section.lo+section.hi+1)/2:0,width:section?.size??0,crossing});
  }
  roadGeometry.set(layout,marks);return marks;
}

// 20m街道：4×3.2m车道+2m分隔带+2×2.6m人行道。
// 40m主路：6×3.5m车道+4m分隔带+两侧各3m人行道/2m绿带/2.5m停车带。
export function roadProfile(widthMeters){
  const wide=widthMeters>=30,standard=wide?40:20,ratio=widthMeters/standard;
  return {width:widthMeters,lanes:wide?3:2,lane:(wide?3.5:3.2)*ratio,median:(wide?4:2)*ratio,sidewalk:(wide?3:2.6)*ratio,green:(wide?2:0)*ratio,parking:(wide?2.5:0)*ratio};
}
export function roadCellParts(layout,x,y,cellMeters=20){
  const mark=roadMarkings(layout).get(y*layout.width+x);if(!mark)return [];
  const parts=[],add=(a,b,w,h,color,height=0)=>{if(w>1e-7&&h>1e-7)parts.push({x:a,y:b,w,h,color,height});};
  add(x,y,1,1,'#475057');
  const {axis,center,width,crossing,mask}=mark;
  if(!axis){
    const curb=Math.min(.18,2.6/cellMeters);
    if(!(mask&1))add(x,y,1,curb,'#a1a394',.15);
    if(!(mask&4))add(x,y+1-curb,1,curb,'#a1a394',.15);
    if(!(mask&8))add(x,y,curb,1,'#a1a394',.15);
    if(!(mask&2))add(x+1-curb,y,curb,1,'#a1a394',.15);
    return parts;
  }
  const p=roadProfile(width*cellMeters),half=p.width/2;
  // 跨两格主路的构件先按整条横断面定位，再裁到本格，不能出现两条独立中心线。
  const band=(cross,w,color,height=0,lo=0,hi=cellMeters)=>{
    const a=Math.max(0,center+(cross-half)/cellMeters),b=Math.min(1,center+(cross+w-half)/cellMeters);
    const l=Math.max(0,lo/cellMeters),r=Math.min(1,hi/cellMeters);if(b<=a||r<=l)return;
    if(axis==='v')add(x+a,y+l,b-a,r-l,color,height);else add(x+l,y+a,r-l,b-a,color,height);
  };
  const lo=crossing<0?5.5:0,hi=crossing>0?cellMeters-5.5:cellMeters;
  for(const side of [0,1]){
    const edge=side?p.width-p.sidewalk:0;band(edge,p.sidewalk,'#a1a394',.15);
    band(side?edge-.16:edge+p.sidewalk,.16,'#c1bdab',.16);
    for(let z=0;z<cellMeters;z+=4)band(edge,p.sidewalk,'#858b80',.151,z,z+.025);
    if(p.green){const green=side?edge-p.green:edge+p.sidewalk;band(green,p.green,'#728567',.10,lo,hi);}
    if(p.parking){const park=side?edge-p.green-p.parking:edge+p.sidewalk+p.green;band(park,p.parking,'#525b5c');
      for(let z=0;z<cellMeters;z+=6)if(z>=lo&&z<hi)band(park,p.parking,'#a8b1a3',.012,z,z+.15);
    }
  }
  band(half-p.median/2,p.median,'#718062',.10,lo,hi);
  for(const sign of [-1,1]){
    band(half+sign*p.median/2-.075,.15,'#c5b57d',.012,lo,hi);
    for(let lane=1;lane<p.lanes;lane++){
      const cross=half+sign*(p.median/2+lane*p.lane)-.075;
      for(let z=0;z<cellMeters;z+=10)band(cross,.15,'#d7d5bd',.012,Math.max(lo,z+1),Math.min(hi,z+5.5));
    }
  }
  if(crossing){
    const start=crossing<0?1.2:cellMeters-4.2;
    for(let cross=p.sidewalk+p.green+p.parking;cross<p.width-p.sidewalk-p.green-p.parking;cross+=1){
      if(Math.abs(cross+.25-half)<p.median/2)continue;
      band(cross,.5,'#dedfce',.014,start,start+3);
    }
    for(const sign of [-1,1])band(sign<0?p.sidewalk+p.green+p.parking:half+p.median/2,p.lanes*p.lane,'#dedfce',.014,crossing<0?5:cellMeters-5.2,crossing<0?5.2:cellMeters-5);
  }
  return parts;
}
