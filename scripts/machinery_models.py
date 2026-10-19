"""按2026-10-19参考板构造三件不同身份的mid poly机械，尺寸不是新增玩法参数。"""
import math
import random
from mathutils import Vector

REF='concepts/purification-system-2026-10-19/'
INFO={
    'purification-tower':{'name':'净化塔','footprint':[40,40],'equipment':[20,20,26],'role':'human-purification-core','sheet':REF+'01-purification-tower.png','features':['four-containment-pylons','irregular-alien-core','processing-cabinets','service-stairs']},
    'mechanical-tower':{'name':'机械塔','footprint':[20,20],'equipment':[5,5,18],'role':'human-unmanned-relay','sheet':REF+'02-mechanical-relay-tower.png','features':['tapered-lattice-mast','fixed-four-way-light','upward-light-face','no-purification']},
    'legacy-machine':{'name':'旧人类机械体','footprint':[8,8],'equipment':[2.5,4.6,1.9],'role':'legacy-human-enemy','sheet':REF+'03-legacy-combat-machine.png','features':['compact-tracked-chassis','turret-pivot','barrel-pivot','red-orange-optics']}
}


def purification(m):
    """40m用地内20m设备平台，四组人工夹具包围不规则异质核心。"""
    m.site(40,40)
    m.box('20m设备基础',(0,0,.35),(20,20,.65),m.q.concrete,.18)
    m.box('中央维护层',(0,0,.83),(16.5,16.5,.35),m.surface,.08)
    m.cylinder('核心下承台',(0,0,1.55),4.4,1.2,m.metal,32)
    m.cylinder('核心处理腔',(0,0,3.6),3.7,3,m.surface,32)
    for z,r in [(2.2,3.78),(3.4,3.79),(4.9,3.85)]:m.ring('处理腔法兰',(0,0,z),r,.12,m.steel)
    for i in range(16):
        a=i*math.tau/16;x,y=math.cos(a)*3.75,math.sin(a)*3.75
        m.girder('处理腔立筋',(x,y,2.1),(x,y,5.15),.16,.2,m.metal)
        m.bolt(x,y,5.19,.1)
    # 四角承力塔不是复制住宅：斜柱、液压缸和顶部夹爪共同约束核心。
    for sx,sy in [(-1,-1),(1,-1),(1,1),(-1,1)]:
        x,y=sx*6.3,sy*6.3
        m.taper('锥台混凝土承脚',(x,y,2.5),(4.7,4.7),(3.2,3.2),4.3,m.q.concrete)
        m.box('承脚钢座',(x,y,4.8),(3.35,3.35,.42),m.metal,.09)
        a=(x,y,4.9);b=(sx*4.25,sy*4.25,23.2);c=(sx*1.7,sy*1.7,24.5)
        m.girder('倾斜承力主柱',a,b,1.25,1.6,m.metal)
        m.girder('顶部转化夹臂',b,c,1.2,1.4,m.surface)
        outer=Vector((sx*.62,sy*.62,0))
        m.girder('柱面外护板',Vector(a)+outer,Vector(b)+outer,.74,.16,m.surface)
        m.girder('柱面中凹槽',Vector(a)+outer*1.15+Vector((0,0,.8)),Vector(b)+outer*1.15-Vector((0,0,.9)),.16,.1,m.dark)
        for j in range(7):
            p=Vector(a).lerp(Vector(b),.12+j*.115)+outer*1.16
            m.box('柱面装配盖板',p,(.44,.44,.2),m.edge,.025)
        # 大液压套筒与活塞杆同轴，较细管束在旁，尺度层次明确。
        pa=Vector(a)+Vector((-sy*.9,sx*.9,0))+Vector((0,0,.4))
        pb=Vector(b)+Vector((-sy*.9,sx*.9,0))-Vector((0,0,1.2))
        m.beam('液压缸套筒',pa,pa.lerp(pb,.43),.26,m.surface)
        m.beam('液压活塞杆',pa.lerp(pb,.40),pb,.12,m.steel)
        for t in (.04,.39):
            pp=pa.lerp(pb,t)
            m.ico('液压固定铰',pp,(.36,.36,.32),m.metal,1)
        for t in (.16,.43,.70,.92):
            p=Vector(a).lerp(Vector(b),t)
            m.box('承力柱维护护盖',p,(1.45,1.78,.38),m.surface,.05)
        m.pipe('柱侧液压管',[(x-sx*.75,y-sy*.35,5.2),(sx*3.7,sy*4.15,21.7),(sx*3.35,sy*3.35,23.45)],.09,m.steel)
        m.girder('黄色夹臂标记',(sx*4.23,sy*4.25,23.6),(sx*2.7,sy*2.7,24.4),.16,1.47,m.yellow)
        # 关节轴实际横穿弯折部位；提供近景可理解的装配关系。
        axle=m.cylinder('上部转轴',(sx*4.25,sy*4.25,23.15),.62,1.65,m.steel,24);axle.rotation_euler.y=math.pi/2
        for zz in (5.6,6.9,8.2):m.box('检修侧翼',(x+sx*1.15,y,zz),(.68,1.8,.48),m.surface,.05)
        # 陶瓷绝缘叠片与柱脚管束。
        px,py=x+sx*.9,y-sy*1.4
        m.cylinder('绝缘件中轴',(px,py,6),.28,5.6,m.steel,16)
        for j in range(16):m.cylinder('陶瓷绝缘叠片',(px,py,3.5+j*.32),.63,.16,m.edge,20)
        m.pipe('回流管',[(px,py,3),(px,py,1.4),(sx*3.8,sy*3.8,1.4)],.16,m.steel)
        for dx in (-1.1,1.1):
            for dy in (-1.1,1.1):m.bolt(x+dx,y+dy,5.04,.12)
        for j in range(3):
            m.box('承脚维护分缝',(x,y-sy*(2.24-j*.16),1.3+j*.8),(2.25,.035,.08),m.metal,.008)
    # 悬置核心的人工承托环和侧向固定，核心不靠魔法悬空。
    m.cylinder('异质材料承托',(0,0,8.1),2.15,6.2,m.metal,24)
    for z in (6.0,9.2,12.1,19.3):
        m.ring('核心约束环',(0,0,z),2.45,.22,m.steel)
        for i in range(4):
            a=i*math.pi/2+.7
            m.girder('径向人工夹具',(math.cos(a)*2,math.sin(a)*2,z),(math.cos(a)*3.35,math.sin(a)*3.35,z),.3,.4,m.surface)
    before=set(m.source.objects)
    shell=m.material('异质核心暗青外壳','#46736d',.5,.25,True)
    # 扭转分层的闭合不规则网格，保留岩层/有机晶质，不做纯白灯球。
    levels=[(10.8,.65),(12,1.6),(14,2.0),(16.8,1.65),(19.2,1.9),(21.6,1.25),(23.5,.9),(25.6,.08)]
    count=13;verts=[]
    for k,(z,r) in enumerate(levels):
        for i in range(count):
            a=i*math.tau/count+k*.17;rr=r*random.uniform(.78,1.12)
            verts.append((math.cos(a)*rr+math.sin(k*1.1)*.22,math.sin(a)*rr,z+random.uniform(-.18,.18)))
    faces=[]
    for k in range(len(levels)-1):
        for i in range(count):
            a=k*count+i;b=k*count+(i+1)%count;c=(k+1)*count+i;d=(k+1)*count+(i+1)%count
            faces.extend([(a,b,c),(b,d,c)])
    faces.extend([tuple(reversed(range(count))),tuple(range((len(levels)-1)*count,len(levels)*count))])
    core=m.mesh('非对称分层外星核心',verts,faces,shell)
    shell_light=m.material('核心层理浅面','#729b91',.48,.2,True)
    shell_dark=m.material('核心层理暗面','#385a57',.6,.18,True)
    core.data.materials.append(shell_light);core.data.materials.append(shell_dark)
    for poly in core.data.polygons:
        poly.material_index=random.choices([0,1,2],[.6,.22,.18])[0]
    for i in range(1,len(levels)-1):
        for j in range(0,count,4):
            # 细亮裂隙沿实际表面边，避免把整片三角面点成白斑。
            a=Vector(verts[i*count+j]);b=Vector(verts[(i+1)*count+j])
            a.x*=1.02;a.y*=1.02;b.x*=1.02;b.y*=1.02
            m.beam('表面异质裂隙',a,b,.028,m.glow)
    for i in range(20):
        a=random.random()*math.tau;z=random.uniform(12.2,23.7);r=random.uniform(.8,1.45)
        shard=m.ico('核心鳞片结晶',(math.cos(a)*r,math.sin(a)*r,z),(random.uniform(.18,.48),random.uniform(.25,.55),random.uniform(.65,1.5)),shell if i%3 else shell_light,1)
        shard.rotation_euler=(random.uniform(-.3,.3),random.uniform(-.3,.3),a)
    for i in range(7):
        a=i*math.tau/7
        m.pipe('核心细窄发光纹路',[(math.cos(a+k*.13)*(1.2+.35*math.sin(k)),math.sin(a+k*.13)*(1.2+.35*math.sin(k)),11.4+k*1.75) for k in range(8)],.035,m.glow)
    m.part('AlienCore',set(m.source.objects)-before,(0,0,18))
    # 可走的环形平台与实际台阶，维护部件在俯视里也有结构。
    for side in (-1,1):
        m.box('检修步道',(side*5.8,0,1.18),(2.2,10.2,.15),m.metal,.03)
        m.railing((side*6.9,-4.6,1.27),(side*6.9,4.6,1.27))
        for y in (-3.5,0,3.5):m.cabinet(side*8,y,1.05,1.6,1.1,2.5,turn=side*math.pi/2)
    for i in range(7):
        m.box('前侧检修台阶',(0,-10.2+i*.36,.12+i*.16),(2.4,.38,.2),m.metal,.02)
    m.railing((-1.35,-10.2,.25),(-1.35,-7.9,1.27))
    m.railing((1.35,-10.2,.25),(1.35,-7.9,1.27))
    for y in (-6,6):
        m.box('横向电缆托架',(0,y,1.16),(9,.5,.18),m.metal,.015)
        for i in range(16):m.box('托架横档',(-4+i*.52,y,1.3),(.08,.62,.1),m.steel,.005)
    for x in (-4.8,4.8):
        for y in (-5.2,5.2):m.cabinet(x,y,1.07,2,1,2.4)
    for i in range(8):
        a=i*math.tau/8
        m.pipe('处理模块外露弯管',[(math.cos(a)*3.4,math.sin(a)*3.4,4),(math.cos(a)*4.6,math.sin(a)*4.6,4),(math.cos(a)*4.6,math.sin(a)*4.6,1.6)],.15,m.steel)
    for x in (-3.4,3.4):
        m.box('前部散热模块',(x,-5,2.4),(1.65,.7,2.55),m.metal,.07)
        for i in range(18):m.box('模块散热鳍片',(x,-5.4,1.3+i*.12),(1.5,.17,.04),m.steel,.006)
    for side in (-1,1):
        for i in range(5):m.box('地基危险标识',(side*(7.3+i*.4),-9.7,.71),(.23,.5,.02),m.yellow,0,turn=-.45)
    # 整个40m范围保留维护余量；比例车属于可拆展示组，不是设备本体。
    before=set(m.source.objects);m.q.car(14,-13)
    m.part('ScaleCar',set(m.source.objects)-before)
    for position in [(-2.5,-.6,13.5),(1.8,1.8,19.5),(0,-2.3,23)]:m.point_light(position,85,10,day=True)
    m.point_light((0,-5.8,3.4),130,11,'#d0e7df')


def relay(m):
    """5m设备基座与18m无人格构桅杆，灯具固定照灰地而不净化。"""
    m.site(20,20,True)
    m.box('5m混凝土设备基座',(0,0,.4),(5,5,.75),m.q.concrete,.12)
    m.box('钢制基脚平台',(0,0,.83),(4.5,4.5,.16),m.metal,.035)
    for sx,sy in [(-1,-1),(1,-1),(1,1),(-1,1)]:
        a=(sx*1.95,sy*1.95,.96);b=(sx*.58,sy*.58,14.8)
        m.girder('锥形主桅杆',a,b,.21,.21,m.metal)
        m.box('锚固板',(sx*1.95,sy*1.95,.96),(.62,.62,.11),m.steel,.025)
        for dx in (-.21,.21):m.bolt(sx*1.95+dx,sy*1.95,1.04,.075)
    def radius(z):return 1.95-(z-.96)/(14.8-.96)*1.37
    for level in range(7):
        z=.96+level*1.96;nz=min(14.8,z+1.96);r=radius(z);rr=radius(nz)
        for side in (-1,1):
            m.beam('格构侧面X撑',(side*r,-r,z),(side*rr,rr,nz),.065,m.steel)
            m.beam('格构侧面X撑',(side*r,r,z),(side*rr,-rr,nz),.065,m.steel)
            m.beam('格构正面X撑',(-r,side*r,z),(rr,side*rr,nz),.065,m.steel)
            m.beam('格构正面X撑',(r,side*r,z),(-rr,side*rr,nz),.065,m.steel)
            m.beam('水平连杆',(-r,side*r,z),(r,side*r,z),.075,m.metal)
    m.cabinet(-.95,-.75,.94,1.4,.85,1.95)
    m.cabinet(.95,.8,.94,1.3,.9,2.3,math.pi)
    m.box('后备电源箱',(.95,-.85,1.3),(1.2,.9,.7),m.surface,.06)
    for x in (-.3,.3):m.beam('直爬梯侧轨',(x,-.63,1),(x,-.63,15.7),.038,m.yellow)
    for i in range(46):m.beam('直爬梯横档',(-.3,-.66,1.05+i*.31),(.3,-.66,1.05+i*.31),.028,m.steel)
    m.pipe('塔身电缆束',[(.12,.2,1),(.12,.2,15.7)],.09,m.dark)
    for i in range(4):
        a=i*math.pi/2;x,y=math.cos(a)*.68,math.sin(a)*.68
        m.box('板状通信天线',(x,y,16.35),(.32,.2,2.1),m.edge,.04,turn=a)
        m.beam('天线安装杆',(x,y,15.2),(x,y,17.4),.055,m.steel)
    m.box('固定照明安装台',(0,0,15.05),(2,2,.18),m.metal,.045)
    for i in range(4):
        a=i*math.pi/2;d=Vector((math.cos(a),math.sin(a),0));p=d*1.12+Vector((0,0,14.92))
        m.girder('固定灯具支臂',d*.3+Vector((0,0,15.12)),p,.15,.15,m.metal)
        lamp=m.box('宽角固定灯壳',p,(.75,.6,.32),m.metal,.07,turn=a)
        face=m.box('向外向下LED面',p-Vector((0,0,.17)),(.61,.48,.03),m.white_light,.01,turn=a)
        # 稍外倾而非追踪：光束目标是实际固定地面点。
        # 灯位在透光面外侧，避免Cycles中埋进不透明灯壳后被自身完全遮住。
        m.spot_light(tuple(p-Vector((0,0,.25))),tuple(d*5.7+Vector((0,0,.05))),650,27,.64)
    m.cylinder('向上灯支座',(0,0,17.63),.42,.3,m.metal,24)
    m.cylinder('俯视可见向上灯面',(0,0,17.82),.43,.09,m.white_light,32)
    m.ring('向上灯防护缘',(0,0,17.83),.49,.045,m.steel,32)
    m.beam('短通讯天线',(.63,.25,16.9),(.63,.25,18),.025,m.steel)
    status=m.material('无人网络状态青灯','#6eb4c7',.4,0,day=.5,night=1.6)
    m.box('联网小状态灯',(-.95,-1.195,2.31),(.13,.025,.08),status,.012)
    m.point_light((0,0,17.93),28,4,'#d9eeed')
    # 比例车仍留厚灰；不出现不适合生存环境里的无防护人物。
    before=set(m.source.objects);m.q.car(6.8,-5.9,1)
    m.part('ScaleCar',set(m.source.objects)-before)


def legacy(m):
    """汽车量级无人履带战斗机械，活动节点与底座装饰分离。"""
    m.site(8,8,True)
    olive=m.material('旧军绿漆面','#626858',.67,.4,True,weathered=True)
    worn=m.material('装甲边缘磨损','#a19a82',.7,.35,True)
    rust=m.material('局部锈蚀','#786248',.9,.1,True)
    m.box('窄底盘',(0,.18,.55),(1.72,3.72,.58),m.metal,.11)
    m.taper('倾斜上装甲',(0,.11,1.0),(1.92,3.94),(1.55,3.1),.58,olive)
    for side in (-1,1):
        x=side*1.02
        before=set(m.source.objects)
        # 闭合履带：两条直边与前后半圆。每节都有胶块/金属外缘。
        path=[];r=.43;front=-1.35;back=1.72;cz=.52
        for i in range(20):path.append((front+(back-front)*i/20,cz+r,0))
        for i in range(10):
            a=math.pi/2-i*math.pi/10;path.append((back+r*math.cos(a),cz+r*math.sin(a),math.pi/2-a))
        for i in range(20):path.append((back-(back-front)*i/20,cz-r,math.pi))
        for i in range(10):
            a=-math.pi/2-i*math.pi/10;path.append((front+r*math.cos(a),cz+r*math.sin(a),math.pi/2-a))
        for y,z,turn in path:
            shoe=m.box('分节履带钢板',(x,y,z),(.48,.16,.065),m.metal,.012);shoe.rotation_euler.x=turn
            pad=m.box('履带橡胶块',(x,y,z+.032),(.31,.105,.028),m.rubber,.008);pad.rotation_euler.x=turn
        for y in (-1.35,-.73,-.1,.52,1.1,1.72):
            wheel=m.cylinder('负重轮',(x,y,.5),.365,.32,m.rubber,24);wheel.rotation_euler.y=math.pi/2
            hub=m.cylinder('负重轮装甲盘',(x+side*.18,y,.5),.255,.035,olive,20);hub.rotation_euler.y=math.pi/2
            axle=m.cylinder('轮轴金属盖',(x+side*.21,y,.5),.105,.05,m.steel,12);axle.rotation_euler.y=math.pi/2
        m.part('TrackLeft' if side<0 else 'TrackRight',set(m.source.objects)-before)
        m.box('履带上护板',(side*1.03,.16,1.12),(.48,3.9,.12),olive,.04)
        for j in range(6):
            y=-1.4+j*.62
            m.box('可拆侧装甲',(side*.98,y,1.03),(.12,.53,.41),olive,.028)
            for z in (.9,1.16):
                bolt=m.cylinder('侧装甲六角件',(side*1.055,y-.18,z),.036,.022,worn,6);bolt.rotation_euler.y=math.pi/2
        m.box('牵引安装座',(side*.65,-1.91,.73),(.26,.17,.19),m.metal,.035)
        m.pipe('前牵引环',[(side*.65-.09,-2.01,.72),(side*.65-.09,-2.08,.54),(side*.65+.09,-2.08,.54),(side*.65+.09,-2.01,.72)],.035,m.steel)
    # 顶部散热格栅、装甲拼缝、检修盖，选择性细节而非全表面随机铆钉。
    m.box('后部动力舱盖',(0,1.23,1.335),(1.47,.83,.065),m.metal,.025)
    for x in (-.4,.4):
        m.box('散热凹槽',(x,1.24,1.38),(.49,.62,.025),m.dark,.015)
        for j in range(10):m.box('散热栅叶',(x,.98+j*.055,1.4),(.47,.018,.025),olive,.004)
    for side in (-1,1):
        m.box('侧面储物箱',(side*.8,.5,1.41),(.29,.8,.38),olive,.04)
        m.pipe('车体扶手',[(side*.8,.25,1.6),(side*.8,.25,1.69),(side*.8,.7,1.69),(side*.8,.7,1.6)],.018,m.steel)
        m.box('前方微型传感灯',(side*.62,-1.72,1.16),(.14,.05,.075),m.red_light,.018)
    before=set(m.source.objects)
    m.cylinder('转塔回转座',(0,-.16,1.32),.64,.2,m.metal,32)
    m.taper('低矮斜面无人转塔',(0,-.22,1.56),(1.35,1.35),(1.08,1.12),.38,olive)
    m.box('转塔检修盖',(0,-.12,1.79),(.64,.63,.06),olive,.03)
    m.ring('小型检修舱缘',(0,-.11,1.83),.26,.018,m.steel,24)
    for side in (-1,1):
        m.box('武器耳轴护盖',(side*.53,-.57,1.62),(.22,.42,.29),m.metal,.04)
        for y in (-.52,-.14,.24):m.bolt(side*.52,y,1.78,.035)
    m.box('红外光学箱',(.34,-.3,1.92),(.43,.43,.27),m.metal,.035)
    housing=m.cylinder('光学传感器镜框',(.34,-.54,1.92),.13,.075,m.steel,20);housing.rotation_euler.x=math.pi/2
    lens=m.cylinder('敌方红橙镜片',(.34,-.585,1.92),.095,.018,m.red_light,24);lens.rotation_euler.x=math.pi/2
    m.beam('短无线天线',(-.4,.25,1.77),(-.4,.25,2.25),.013,m.metal)
    turret=m.part('Turret',set(m.source.objects)-before,(0,-.16,1.36))
    before=set(m.source.objects)
    m.box('炮管后座',(0,-.88,1.57),(.36,.36,.29),m.metal,.035)
    # 炮管沿-Y，实体空膛口有黑色内腔，不是一根实心灰棒。
    for y,r,length in [(-1.18,.105,.48),(-1.71,.065,.75),(-2.19,.10,.25)]:
        gun=m.cylinder('自动炮管',(0,y,1.6),r,length,m.steel if r<.1 else m.metal,16);gun.rotation_euler.x=math.pi/2
    muzzle=m.cylinder('炮口内膛',(0,-2.325,1.6),.065,.012,m.dark,16);muzzle.rotation_euler.x=math.pi/2
    barrel=m.part('Barrel',set(m.source.objects)-before,(0,-.85,1.6))
    # 导出嵌套枢轴需要保持父子关系；转塔俯仰和车体转向不合并。
    barrel.parent=turret;barrel.location-=turret.location
    for i in range(45):
        # 车身顶面少量尘泥/掉漆，避免用噪声淹没大轮廓。
        x=random.uniform(-.7,.7);y=random.uniform(.75,1.55)
        m.box('动力舱边缘掉漆',(x,y,1.38),(random.uniform(.025,.09),random.uniform(.025,.12),.006),rust if i%3 else worn,0)
    m.root['equipmentBodyMeters']=[2.5,4.6,1.9]
    m.root['antennaHeightMeters']=2.25
    m.root['faction']='legacy-human-machinery';m.root['doesNotAttackOtherLegacyMachines']=True


BUILD={'purification-tower':purification,'mechanical-tower':relay,'legacy-machine':legacy}
