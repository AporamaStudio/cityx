"""从项目内CC0楼体生成固定配套废墟；保留原UV/贴图，不改变游戏占地。"""
from pathlib import Path
import importlib.util
import json
import math
import struct

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('preview_props',ROOT/'scripts/generate-preview-props.py')
props=importlib.util.module_from_spec(spec);spec.loader.exec_module(props)
FILES=['suburban/building-type-a','suburban/building-type-h','suburban/building-type-u','commercial/building-a','commercial/building-d','commercial/building-j','industrial/building-a','industrial/building-f']


def generate(file):
    path=ROOT/'assets/model-preview/kenney'/f'{file}.glb'
    data=path.read_bytes();length=struct.unpack_from('<I',data,12)[0]
    doc=json.loads(data[20:20+length]);source_binary=data[28+length:];source_accessors=doc['accessors'];source_views=doc['bufferViews'];binary=bytearray()
    # 仅复制原嵌入贴图，旧几何随后替换，避免在派生GLB保留两份楼体数据。
    doc['accessors']=[];doc['bufferViews']=[]
    for image in doc.get('images',[]):
        v=source_views[image['bufferView']];offset=v.get('byteOffset',0);binary.extend(b'\0'*(-len(binary)%4));start=len(binary);binary.extend(source_binary[offset:offset+v['byteLength']])
        image['bufferView']=len(doc['bufferViews']);doc['bufferViews'].append({'buffer':0,'byteOffset':start,'byteLength':v['byteLength']})
    def read(index):
        a=source_accessors[index];v=source_views[a['bufferView']]
        components={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[a['type']]
        kind={5126:'f',5125:'I',5123:'H',5121:'B'}[a['componentType']]
        fmt='<'+kind*components;stride=v.get('byteStride',struct.calcsize(fmt));offset=v.get('byteOffset',0)+a.get('byteOffset',0)
        return [struct.unpack_from(fmt,source_binary,offset+i*stride) for i in range(a['count'])]
    def attribute(values,components):
        binary.extend(b'\0'*(-len(binary)%4));offset=len(binary)
        binary.extend(struct.pack('<'+'f'*len(values),*values))
        doc['bufferViews'].append({'buffer':0,'byteOffset':offset,'byteLength':len(values)*4,'target':34962})
        a={'bufferView':len(doc['bufferViews'])-1,'componentType':5126,'count':len(values)//components,'type':'VEC'+str(components)}
        if components==3:a.update(min=[min(values[i::3]) for i in range(3)],max=[max(values[i::3]) for i in range(3)])
        doc['accessors'].append(a);return len(doc['accessors'])-1
    original=doc['meshes'][0]['primitives'];positions=[p for primitive in original for p in read(primitive['attributes']['POSITION'])]
    lo=[min(p[i] for p in positions) for i in range(3)];hi=[max(p[i] for p in positions) for i in range(3)]
    width,height,depth=[hi[i]-lo[i] for i in range(3)];cx,cz=(lo[0]+hi[0])/2,(lo[2]+hi[2])/2
    cut=lo[1]+height*.36
    def broken(p):return p[0]>cx-width*.10 and p[2]<cz+depth*.18 and p[1]>cut
    def normal(a,b,c):
        u=[b[i]-a[i] for i in range(3)];v=[c[i]-a[i] for i in range(3)]
        n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];length=math.sqrt(sum(x*x for x in n))
        return [x/length for x in n] if length>1e-10 else None
    output=[]
    for primitive in original:
        points=read(primitive['attributes']['POSITION']);uv=read(primitive['attributes']['TEXCOORD_0'])
        indices=[i[0] for i in read(primitive['indices'])] if 'indices' in primitive else list(range(len(points)))
        vertices=[];normals=[];texcoords=[]
        for i in range(0,len(indices),3):
            ids=indices[i:i+3];triangle=[list(points[j]) for j in ids];mid=[sum(p[a] for p in triangle)/3 for a in range(3)]
            # 部分上层丢失、周边残壁降低，入口和大部分楼体保留同一识别轮廓。
            if any(broken(p) for p in triangle) and mid[0]>cx-width*.10 and mid[2]<cz+depth*.22 and mid[1]>lo[1]+height*.35:continue
            for p in triangle:
                if broken(p):p[1]=cut+(p[1]-cut)*.08+height*.025*abs(math.sin(p[0]*14+p[2]*16))
            n=normal(*triangle)
            if n is None:continue
            for p,j in zip(triangle,ids):vertices.extend(p);normals.extend(n);texcoords.extend(uv[j])
        if vertices:output.append({'attributes':{'POSITION':attribute(vertices,3),'NORMAL':attribute(normals,3),'TEXCOORD_0':attribute(texcoords,2)},'material':primitive['material']})
    # 暗基础层维持原包围占地，破口内的断梁/碎块不扩到其他地块。
    debris=props.Model();debris.box((cx,lo[1]+height*.025,cz),(width,height*.05,depth),'#41483e')
    debris.box((cx+width*.19,lo[1]+height*.17,cz-depth*.18),(width*.49,height*.025,depth*.52),'#363d36')
    for i in range(8):
        x=cx+width*(.03+(i%4)*.10+.035*math.cos(i*2.1));z=cz-depth*(.08+(i//4)*.18+.04*math.sin(i*1.7))
        angle=math.sin(i*3.17)*1.1;basis=((math.cos(angle),0,math.sin(angle)),(0,1,0),(-math.sin(angle),0,math.cos(angle)))
        debris.box((x,lo[1]+height*(.205+(i%3)*.008),z),(width*(.045+(i%3)*.015),height*.055,depth*(.05+(i%2)*.035)),'#9c927c' if i%2 else '#7c806e',basis)
    debris.beam((cx-width*.04,lo[1]+height*.24,cz-depth*.3),(cx+width*.35,lo[1]+height*.18,cz+depth*.03),width*.04,'#706b58')
    for color,(vertices,normals) in debris.parts.items():
        srgb=[int(color[i:i+2],16)/255 for i in (1,3,5)];rgb=[v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4 for v in srgb]
        doc['materials'].append({'name':color,'pbrMetallicRoughness':{'baseColorFactor':rgb+[1],'metallicFactor':0,'roughnessFactor':1}})
        output.append({'attributes':{'POSITION':attribute(vertices,3),'NORMAL':attribute(normals,3)},'material':len(doc['materials'])-1})
    doc['meshes'][0]['primitives']=output;doc['nodes'][0]['name']+='-ruined'
    doc['nodes'][0]['extras']={'variant':'ruined','intactModel':path.name,'intactBounds':[lo,hi],'units':'source-model-units','visualOnly':True}
    doc['asset']['generator']='CityX fixed ruins from Kenney CC0 city models';doc['buffers'][0]['byteLength']=len(binary)
    js=json.dumps(doc,separators=(',',':')).encode();js+=b' '*(-len(js)%4);binary.extend(b'\0'*(-len(binary)%4))
    target=path.with_name(path.stem+'-ruined.glb')
    target.write_bytes(struct.pack('<III',0x46546c67,2,28+len(js)+len(binary))+struct.pack('<II',len(js),0x4e4f534a)+js+struct.pack('<II',len(binary),0x004e4942)+binary)
    return target


if __name__=='__main__':
    for file in FILES:print(generate(file).relative_to(ROOT))
