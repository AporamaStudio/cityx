"""生成模型选型页的低面数样件；不接入游戏规则，输出独立GLB。"""
from pathlib import Path
import json
import math
import struct

ROOT = Path(__file__).resolve().parents[1] / 'assets/model-preview/generated'


class Model:
    def __init__(self):
        self.parts = {}

    def triangle(self, points, color):
        a, b, c = points
        u, v = [b[i]-a[i] for i in range(3)], [c[i]-a[i] for i in range(3)]
        n = [u[1]*v[2]-u[2]*v[1], u[2]*v[0]-u[0]*v[2], u[0]*v[1]-u[1]*v[0]]
        length = math.sqrt(sum(x*x for x in n))
        if length < 1e-10:
            return
        vertices, normals = self.parts.setdefault(color, ([], []))
        for p in points:
            vertices.extend(p)
            normals.extend(x/length for x in n)

    def box(self, center, size, color, basis=None):
        # 基础盒体可沿斜撑方向旋转；所有面按外法线绕序输出。
        axes = basis or ((1, 0, 0), (0, 1, 0), (0, 0, 1))
        corners = []
        for signs in [(-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),(-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)]:
            corners.append(tuple(center[i]+sum(signs[j]*size[j]*axes[j][i]/2 for j in range(3)) for i in range(3)))
        for face in [(0,3,2,1),(4,5,6,7),(0,4,7,3),(1,2,6,5),(3,7,6,2),(0,1,5,4)]:
            for tri in [(face[0],face[1],face[2]),(face[0],face[2],face[3])]:
                self.triangle([corners[i] for i in tri], color)

    def beam(self, a, b, width, color):
        direction = [b[i]-a[i] for i in range(3)]
        length = math.sqrt(sum(x*x for x in direction))
        y = [x/length for x in direction]
        ref = (0,0,1) if abs(y[2]) < .9 else (1,0,0)
        x = [y[1]*ref[2]-y[2]*ref[1], y[2]*ref[0]-y[0]*ref[2], y[0]*ref[1]-y[1]*ref[0]]
        xl = math.sqrt(sum(v*v for v in x)); x = [v/xl for v in x]
        z = [x[1]*y[2]-x[2]*y[1], x[2]*y[0]-x[0]*y[2], x[0]*y[1]-x[1]*y[0]]
        self.box([(a[i]+b[i])/2 for i in range(3)], (width,length,width), color, (x,y,z))

    def cylinder(self, center, radius, height, color, top=None, sides=8):
        top = radius if top is None else top
        lo, hi = center[1]-height/2, center[1]+height/2
        for i in range(sides):
            a, b = i*math.tau/sides, (i+1)*math.tau/sides
            p = (center[0]+radius*math.cos(a),lo,center[2]+radius*math.sin(a))
            q = (center[0]+radius*math.cos(b),lo,center[2]+radius*math.sin(b))
            r = (center[0]+top*math.cos(b),hi,center[2]+top*math.sin(b))
            s = (center[0]+top*math.cos(a),hi,center[2]+top*math.sin(a))
            for points in [(p,s,r),(p,r,q),((center[0],lo,center[2]),p,q),((center[0],hi,center[2]),r,s)]:
                self.triangle(points,color)

    def save(self, name):
        # 按材质合并几何，无贴图GLB可直接下载并导入引擎。
        binary = bytearray(); views = []; accessors = []; materials = []; primitives = []
        for color, (positions,normals) in self.parts.items():
            refs = []
            for values in (positions,normals):
                views.append({'buffer':0,'byteOffset':len(binary),'byteLength':len(values)*4,'target':34962})
                binary.extend(struct.pack('<'+'f'*len(values),*values))
                acc = {'bufferView':len(views)-1,'componentType':5126,'count':len(values)//3,'type':'VEC3'}
                if values is positions:
                    acc.update(min=[min(values[i::3]) for i in range(3)],max=[max(values[i::3]) for i in range(3)])
                accessors.append(acc); refs.append(len(accessors)-1)
            srgb = [int(color[i:i+2],16)/255 for i in (1,3,5)]
            rgb = [v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4 for v in srgb]
            material = {'name':color,'pbrMetallicRoughness':{'baseColorFactor':rgb+[1],'metallicFactor':0,'roughnessFactor':.85}}
            if color in ('#ff9538','#ffd36b','#ffe1a3'):
                material['emissiveFactor'] = [v*.7 for v in rgb]
            materials.append(material)
            primitives.append({'attributes':{'POSITION':refs[0],'NORMAL':refs[1]},'material':len(materials)-1})
        doc = {'asset':{'version':'2.0','generator':'CityX low-poly preview props'},'scene':0,'scenes':[{'nodes':[0]}],'nodes':[{'mesh':0,'name':name}], 'meshes':[{'primitives':primitives}], 'materials':materials,'buffers':[{'byteLength':len(binary)}],'bufferViews':views,'accessors':accessors}
        js = json.dumps(doc,separators=(',',':')).encode();js += b' '*((-len(js))%4)
        ROOT.mkdir(parents=True,exist_ok=True)
        (ROOT/(name+'.glb')).write_bytes(struct.pack('<III',0x46546c67,2,28+len(js)+len(binary))+struct.pack('<II',len(js),0x4e4f534a)+js+struct.pack('<II',len(binary),0x004e4942)+binary)


def tower():
    m=Model(); wood='#896449'; dark='#594635'
    for x in (-.7,.7):
        for z in (-.7,.7):
            m.beam((x*1.2,.05,z*1.2),(x,3.1,z),.18,wood)
    for y in (.35,1.55):
        for z in (-.73,.73):
            m.beam((-.73,y,z),(.73,y+1.1,z),.1,dark)
            m.beam((.73,y,z),(-.73,y+1.1,z),.1,dark)
        for x in (-.73,.73):
            m.beam((x,y,-.73),(x,y+1.1,.73),.1,dark)
    m.box((0,3.05,0),(2,.18,2),wood)
    for x in (-.88,.88):
        for z in (-.88,.88):m.box((x,3.75,z),(.1,1.35,.1),wood)
        m.box((x,3.5,0),(.1,.1,1.85),wood)
    for z in (-.88,.88):m.box((0,3.5,z),(1.85,.1,.1),wood)
    m.box((0,4.4,0),(2.3,.16,2.3),'#5e7462')
    for y in [.2+i*.28 for i in range(11)]:m.box((0,y,.88),(.6,.055,.07),wood)
    m.box((0,3.82,-.3),(.45,.22,.65),'#354047')
    m.save('watchtower')


def cannon(long=False):
    m=Model(); steel='#45545a'; accent='#91a66c' if not long else '#a6b1c0'
    m.cylinder((0,.1,0),.55,.2,'#6c7775')
    m.cylinder((0,.28,0),.3,.25,steel)
    m.box((0,.55,0),(.72,.45,.58),steel)
    m.box((0,.76,0),(.55,.08,.42),accent)
    for x in (-.18,.18):
        end=-1.65 if long else -.85
        m.beam((x,.6,-.1),(x,.65,end),.115,'#3f5057')
        m.box((x,.65,end),(.16,.16,.12),'#1e2b32')
    m.box((0,.48,.38),(.55,.26,.26),accent)
    m.save('cannon-long' if long else 'cannon-near')


def props():
    m=Model()
    for row in range(3):
        for col in range(4):m.box(((col-1.5)*.6+(row%2)*.12,.16+row*.31,0),(.56,.29,.4),'#a39a85' if (row+col)%2 else '#b8ac96')
    m.save('brick-wall')
    m=Model()
    for i in range(8):
        a=i*math.tau/8;m.cylinder((math.cos(a)*.65,.12,math.sin(a)*.65),.19,.24,'#858c81',sides=5)
    m.beam((-.55,.22,-.25),(.55,.22,.25),.22,'#6c4934')
    m.beam((-.45,.25,.4),(.45,.25,-.4),.22,'#76563a')
    m.cylinder((0,.65,0),.38,.9,'#ff9538',top=.05,sides=5)
    m.cylinder((.12,.6,.07),.21,.65,'#ffd36b',top=0,sides=5)
    m.save('campfire')
    m=Model();m.box((0,.08,0),(3.3,.16,2.8),'#777b72')
    m.box((-1.4,.95,0),(.2,1.7,2.5),'#a5a090');m.box((0,.7,-1.15),(2.8,1.15,.2),'#b4aa94')
    for i in range(14):
        m.box(((i*1.17)%2.6-1.2,.2+(i%3)*.13,(i*.77)%2.2-1),(.33+(i%3)*.1,.25,.38),'#8e897a' if i%2 else '#b2a895')
    m.beam((-1.3,1.8,-1),(.9,.25,.7),.13,'#535e5c');m.save('ruins')
    m=Model()
    m.box((0,.1,0),(1.8,.2,1.6),'#555b58')
    m.cylinder((0,.7,0),.58,1.15,'#3c464b',top=.38,sides=5)
    m.cylinder((0,1.25,0),.22,.65,'#bd5549',top=.12,sides=5)
    m.box((0,.7,-.48),(.25,.45,.06),'#d36b58');m.save('enemy-source')


def street_props():
    # 城区恢复前后的环境样件：白天保留物体，夜晚发光由预览页控制。
    m=Model();metal='#52645c'
    m.box((0,.08,0),(.42,.16,.42),'#a7ab98')
    m.beam((0,.12,0),(0,3.5,0),.11,metal)
    m.beam((0,3.5,0),(.65,3.5,0),.09,metal)
    m.box((.65,3.48,0),(.4,.12,.28),metal)
    m.box((.65,3.41,0),(.31,.03,.22),'#ffe1a3');m.save('streetlight')
    m=Model()
    for x,z,r in [(-.45,0,.33),(.05,.25,.36),(.5,-.1,.27)]:
        m.cylinder((x,.3,z),r,.55,'#414944',top=r*.55,sides=5)
        m.cylinder((x,.6,z),.055,.12,'#5a6559',top=.03,sides=5)
    for x,z in [(-.65,.4),(.35,.5)]:m.box((x,.05,z),(.35,.09,.26),'#b7aa86')
    m.save('trash')
    m=Model()
    for i in range(10):
        m.box(((i*.43)%1.8-.9,.12+(i%3)*.07,(i*.67)%1.2-.6),(.22+(i%3)*.14,.18,.25+(i%2)*.12),'#989483' if i%2 else '#b3a990')
    m.beam((-.6,.15,-.45),(.5,.28,.45),.09,'#64695c');m.save('rubble')
    m=Model();body='#59615b';charcoal='#323b36'
    m.box((0,.35,0),(1.15,.35,2.55),body)
    m.box((0,.74,.23),(.94,.5,1.24),charcoal)
    m.box((0,1.02,.25),(.96,.08,1.28),'#4a524b')
    m.box((0,.75,-.41),(.78,.3,.055),'#858e82')
    m.box((0,.72,.87),(.73,.27,.055),'#778276')
    for x in (-.58,.58):
        for z in (-.78,.78):m.box((x,.23,z),(.22,.44,.43),'#242e2a')
    m.box((0,.32,-1.3),(1.1,.12,.12),'#687268')
    m.beam((-.4,.55,-1.1),(.35,.85,-.85),.075,charcoal)
    for x,z,h in [(-.22,-.83,.72),(.18,-.75,.55)]:
        m.cylinder((x,.58+h/2,z),.18,h,'#ff9538',top=.025,sides=5)
        m.cylinder((x,.62+h/3,z),.09,h*.65,'#ffd36b',top=0,sides=5)
    m.save('burnt-car')


if __name__ == '__main__':
    tower();cannon();cannon(True);props();street_props()
    print('已生成11个独立GLB样件，含路灯、垃圾、瓦砾与燃烧车辆')
