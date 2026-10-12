"""生成银行与10×12格医院园区，保留命名组件及同楼破损版本。"""
from pathlib import Path
import json
import runpy
import struct

Model = runpy.run_path(str(Path(__file__).with_name('generate-preview-props.py')))['Model']
ROOT = Path(__file__).resolve().parents[1] / 'assets/model-preview/generated'
GLASS = '#587a91'
LAMP = '#ffe1a3'


class Landmark:
    def __init__(self, name, footprint, ruined):
        self.name, self.footprint, self.ruined = name, footprint, ruined
        self.components = {}
        self.roof_lights, self.entry_lights = [], []

    def part(self, name):
        return self.components.setdefault(name, Model())

    def save(self):
        # 共用材质，按建筑组件合并几何；命名供后续接入，不含碰撞或运营逻辑。
        binary, views, accessors, materials, meshes, nodes = bytearray(), [], [], [], [], []
        colors = {}
        for name, model in self.components.items():
            primitives = []
            for color, (positions, normals) in model.parts.items():
                if color not in colors:
                    srgb = [int(color[i:i+2], 16)/255 for i in (1, 3, 5)]
                    rgb = [v/12.92 if v <= .04045 else ((v+.055)/1.055)**2.4 for v in srgb]
                    colors[color] = len(materials)
                    materials.append({'name': color, 'pbrMetallicRoughness': {'baseColorFactor': rgb+[1], 'metallicFactor': .12 if color == '#a08b60' else 0, 'roughnessFactor': .85}})
                refs = []
                for values in (positions, normals):
                    views.append({'buffer': 0, 'byteOffset': len(binary), 'byteLength': len(values)*4, 'target': 34962})
                    binary.extend(struct.pack('<'+'f'*len(values), *values))
                    acc = {'bufferView': len(views)-1, 'componentType': 5126, 'count': len(values)//3, 'type': 'VEC3'}
                    if values is positions:
                        acc.update(min=[min(values[i::3]) for i in range(3)], max=[max(values[i::3]) for i in range(3)])
                    accessors.append(acc); refs.append(len(accessors)-1)
                primitives.append({'attributes': {'POSITION': refs[0], 'NORMAL': refs[1]}, 'material': colors[color]})
            if primitives:
                meshes.append({'name': name, 'primitives': primitives})
                nodes.append({'mesh': len(meshes)-1, 'name': name})
        doc = {'asset': {'version': '2.0', 'generator': 'CityX low-poly landmarks'}, 'scene': 0,
               'scenes': [{'nodes': [0]}], 'nodes': [{'name': self.name, 'children': list(range(1, len(nodes)+1)), 'extras': {'footprint': self.footprint, 'state': 'ruined' if self.ruined else 'intact', 'units': 'game-grid', 'visualOnly': True, 'roofLights': self.roof_lights, 'entryLights': self.entry_lights}}]+nodes,
               'meshes': meshes, 'materials': materials, 'buffers': [{'byteLength': len(binary)}], 'bufferViews': views, 'accessors': accessors}
        data = json.dumps(doc, separators=(',', ':')).encode(); data += b' '*((-len(data)) % 4)
        path = ROOT / (self.name + ('-ruined' if self.ruined else '') + '.glb')
        ROOT.mkdir(parents=True, exist_ok=True)
        path.write_bytes(struct.pack('<III', 0x46546c67, 2, 28+len(data)+len(binary))+struct.pack('<II', len(data), 0x4e4f534a)+data+struct.pack('<II', len(binary), 0x004e4942)+binary)
        print(f'{path.name}: {len(binary)//24} 顶点，{len(meshes)} 个命名组件')


def building(scene, name, x, z, w, d, h, floors, wall, roof, damaged=False, bottom=.22):
    m = scene.part(name)
    # 空心外壳使指定屋顶缺口露出深色内部；损坏不靠整栋替换或随机切洞。
    m.box((x, bottom+.035, z), (w-.16, .07, d-.16), '#424a47' if damaged else '#b5b9ab')
    for sign in (-1, 1):
        side_h = h*.45 if damaged and sign == 1 else h
        m.box((x+sign*(w/2-.09), bottom+side_h/2, z), (.18, side_h, d), wall)
        m.box((x, bottom+side_h/2, z+sign*(d/2-.09)), (w, side_h, .18), wall)
    trim = '#a5b2a6' if roof == '#778e82' else '#a08b60'
    if not damaged:
        m.box((x, bottom+h+.06, z), (w+.12, .12, d+.12), roof)
        for sign in (-1, 1):
            m.box((x+sign*w/2, bottom+h+.16, z), (.10, .20, d+.12), trim)
            m.box((x, bottom+h+.16, z+sign*d/2), (w+.12, .20, .10), trim)
    else:
        m.box((x-w*.31, bottom+h+.03, z), (w*.38, .12, d), roof)
        m.box((x+w*.17, bottom+h+.03, z-d*.35), (w*.58, .12, d*.3), roof)
        debris(scene, name+'-collapse', x, z, w*.8, d*.75, bottom)
        for a, b in [((x-w*.25, bottom+h, z-d*.15), (x+w*.2, bottom+.5, z+d*.2)), ((x-w*.1, bottom+.4, z-d*.2), (x+w*.35, bottom+.7, z+d*.3))]:
            m.beam(a, b, .11, '#65736c')
    windows = scene.part(name+'-windows')
    for floor in range(floors):
        y = bottom+(floor+.55)*h/floors
        for sign in (-1, 1):
            if damaged and sign == 1:
                if floor > 0: continue
            for i in range(max(2, round(w/.7))):
                px = x-w/2+(i+.5)*w/max(2, round(w/.7))
                windows.box((px, y, z+sign*(d/2+.012)), (.38, h/floors*.42, .035), GLASS)
            for i in range(max(2, round(d/.7))):
                pz = z-d/2+(i+.5)*d/max(2, round(d/.7))
                windows.box((x+sign*(w/2+.012), y, pz), (.035, h/floors*.42, .38), GLASS)
    for floor in range(1, floors):
        y = bottom+floor*h/floors
        for sign in (-1, 1):
            if damaged and sign == 1: continue
            m.box((x, y, z+sign*d/2), (w, .065, .05), trim)
            m.box((x+sign*w/2, y, z), (.05, .065, d), trim)


def debris(scene, name, x, z, w, d, y=.22):
    m = scene.part(name)
    for i in range(16):
        px, pz = x+((i*.618) % 1-.5)*w, z+((i*.391) % 1-.5)*d
        m.box((px, y+.12+(i % 3)*.09, pz), (.22+(i % 4)*.07, .16+(i % 3)*.09, .23+(i % 2)*.15), '#929486' if i % 2 else '#6a7168')


def medical_mark(m, x, y, z, size=1.25):
    m.box((x, y, z), (size+.28, .035, size+.28), '#e3e5d6')
    m.box((x, y+.024, z), (size*.3, .035, size), '#4f8b74')
    m.box((x, y+.025, z), (size, .035, size*.3), '#4f8b74')


def tree(m, x, z):
    m.cylinder((x, .55, z), .07, .7, '#7d6951', sides=5)
    m.cylinder((x, 1.0, z), .37, .8, '#82966d', top=.10, sides=6)


def roof_pane(scene, x, y, z, w, d):
    scene.part(scene.name+'-roof-glass').box((x, y, z), (w, .05, d), GLASS)
    scene.roof_lights.append([x, y+.04, z, w, d])


def bank(ruined=False):
    scene = Landmark('bank', [8, 8], ruined)
    base = scene.part('bank-plinth')
    base.box((0, .1, 0), (8, .2, 8), '#b8baa9')
    wall = '#b3ad9e' if ruined else '#d0c5ad'
    # 连续裙楼与中央退台属于同一大楼；大片平屋顶留给未来炮位适配。
    building(scene, 'bank-main', 0, -.35, 7.35, 6.2, 2.6, 3, wall, '#697b79')
    building(scene, 'bank-upper', -.45, -.65, 4.7, 3.7, 1.2, 1, wall, '#657473', bottom=2.96)
    building(scene, 'bank-east-bay', 2.55, -.3, 1.6, 3.0, 1.0, 1, wall, '#697b79', damaged=ruined, bottom=2.96)
    # 破损侧翼下方也露出内层，避免上层损坏看成屋顶杂物。
    if ruined:
        main = scene.components['bank-main']
        # 主屋顶移除东侧一段，以分段屋面保留同楼关系。
        roof_parts = Model()
        for color, data in main.parts.items():
            positions, normals = data; kept_p, kept_n = [], []
            for i in range(0, len(positions), 9):
                mid = [sum(positions[i+j+k] for j in (0, 3, 6))/3 for k in range(3)]
                if mid[0] > 1.85 and abs(mid[2]+.3) < 1.55 and mid[1] > 2.75: continue
                kept_p.extend(positions[i:i+9]); kept_n.extend(normals[i:i+9])
            roof_parts.parts[color] = (kept_p, kept_n)
        scene.components['bank-main'] = roof_parts
    entrance = scene.part('bank-entrance')
    for i in range(3): entrance.box((0, .23+i*.06, 3.25-i*.15), (3.1-i*.12, .06, .7), '#d8d1bb')
    entrance.box((0, 1.45, 2.98), (3.1, .15, 1.0), '#a08b60')
    for x in (-1.22, 1.22): entrance.box((x, .88, 3.2), (.20, 1.25, .20), wall)
    scene.part('bank-entry-glass').box((0, .8, 2.78), (1.75, 1.05, .04), GLASS)
    roof_pane(scene, -.45, 4.315, -.65, 2.0, 1.15)
    for x in (-1.15, -.45, .25): entrance.box((x, 4.35, -.65), (.045, .05, 1.2), '#a08b60')
    # 圆形银行徽记置于屋顶与正面，横竖条让俯视也能辨认。
    badge = scene.part('bank-emblem')
    badge.cylinder((-.45, 4.34, .78), .48, .055, '#a08b60', sides=12)
    badge.box((-.64, 4.38, .78), (.08, .04, .62), '#e3d9b6')
    for z in (.52, .78, 1.04): badge.box((-.46, 4.39, z), (.40, .04, .075), '#e3d9b6')
    for z in (.65, .91): badge.box((-.25, 4.39, z), (.075, .04, .20), '#e3d9b6')
    badge.box((0, 1.95, 2.82), (.88, .52, .035), '#a08b60')
    for x in (-.18, 0, .18): badge.box((x, 1.95, 2.85), (.06, .32, .025), '#e3d9b6')
    lamps = scene.part('bank-entry-lights')
    for x in (-1.0, 1.0): lamps.box((x, 1.55, 3.15), (.25, .04, .22), LAMP)
    scene.entry_lights.append([0, 1.5, 3.2, 13, 4])
    if ruined: debris(scene, 'bank-exterior-rubble', 2.8, 3.05, 1.0, .8)
    scene.save()


def hospital(ruined=False):
    scene = Landmark('hospital', [10, 12], ruined)
    grounds = scene.part('hospital-campus')
    grounds.box((0, .1, 0), (10, .2, 12), '#b9c2b1')
    # 门区与围合庭院只作构图，园区在主游戏仍是完整阻路地块。
    grounds.box((0, .215, 3.8), (2.3, .03, 3.7), '#cbd0be')
    grounds.box((0, .24, 3.6), (1.6, .08, 1.4), '#91a780')
    for x in (-4.6, 4.6): grounds.box((x, .36, 0), (.14, .30, 11.4), '#9daea0')
    grounds.box((0, .36, -5.65), (9.25, .30, .14), '#9daea0')
    for x in (-3.0, 3.0): grounds.box((x, .36, 5.65), (3.3, .30, .14), '#9daea0')
    wall = '#c1c4b6' if ruined else '#dedfd0'
    building(scene, 'hospital-main', 0, -.10, 4.65, 3.2, 2.6, 3, wall, '#778e82')
    building(scene, 'hospital-west-ward', -2.7, -3.6, 3.0, 3.2, 3.55, 4, wall, '#778e82')
    building(scene, 'hospital-east-ward', 2.7, -3.6, 3.0, 3.2, 3.55, 4, wall, '#778e82', damaged=ruined)
    building(scene, 'hospital-emergency', -2.85, 3.0, 3.0, 2.15, 1.45, 2, wall, '#778e82')
    building(scene, 'hospital-services', 2.85, 3.0, 2.6, 2.15, 1.1, 1, wall, '#778e82')
    building(scene, 'hospital-rear-link', 0, -2.45, 2.9, .78, .85, 1, wall, '#778e82')
    for x in (-2.1, 2.1):
        building(scene, 'hospital-front-link-'+('west' if x < 0 else 'east'), x, 1.95, .7, 1.5, .72, 1, wall, '#778e82')
    entrance = scene.part('hospital-entrance')
    entrance.box((0, 1.12, 2.0), (2.7, .13, 1.0), '#8b9e91')
    for x in (-1.1, 1.1): entrance.box((x, .67, 2.25), (.11, .85, .11), '#9cae9e')
    scene.part('hospital-entry-glass').box((0, .74, 1.52), (1.45, .95, .045), GLASS)
    medical_mark(scene.part('hospital-main-sign'), 0, 2.98, -.1, 1.50)
    medical_mark(scene.part('hospital-emergency-sign'), -2.85, 1.85, 3.0, .70)
    panes = [(-2.7, -3.6, 3.90), (2.85, 3.0, 1.45), (-1.55, -.7, 2.98), (1.55, -.7, 2.98)]
    if not ruined: panes.append((2.7, -3.6, 3.90))
    for x, z, y in panes: roof_pane(scene, x, y, z, .70, .30)
    lamps = scene.part('hospital-entry-lights')
    for x in (-.85, .85): lamps.box((x, 1.2, 2.25), (.24, .045, .24), LAMP)
    scene.entry_lights.append([0, 1.2, 2.25, 13, 4])
    for x in (-4.35, 4.35):
        lamps.box((x, .8, 4.8), (.10, 1.15, .10), '#718777')
        lamps.box((x, 1.40, 4.8), (.25, .06, .25), LAMP)
        scene.entry_lights.append([x, 1.4, 4.8, 10, 3])
        tree(grounds, x, 3.6)
    # 静态救护车只增加医疗识别，不新增车辆玩法。
    car = scene.part('hospital-ambulance')
    car.box((-2.9, .55, 4.95), (.7, .5, 1.35), '#e0e2d5')
    car.box((-2.9, .86, 4.77), (.65, .2, .95), '#e0e2d5')
    car.box((-2.9, .72, 5.52), (.53, .20, .03), '#3b596c')
    medical_mark(car, -2.9, .98, 4.77, .30)
    for x in (-3.25, -2.55):
        for z in (4.5, 5.35): car.box((x, .35, z), (.11, .24, .26), '#43504b')
    if ruined: debris(scene, 'hospital-east-rubble', 3.4, -.8, 1.35, .9)
    scene.save()


if __name__ == '__main__':
    bank(); bank(True); hospital(); hospital(True)
