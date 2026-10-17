"""通信中心：设备楼、渐细格构塔、板状天线和真实曲面卫星锅。"""
import math
INFO={'name':'通信中心','footprint':[80,100],'mainBuilding':[35,20],'sheet':'03-city-services','cameraHeight':8,'landmarks':{'entrance':[6,-14],'equipment':[6,-2],'mast':[-23,20],'dish':[-1,-1]}}


def dish(q,x,y,z,radius=2.4,turn=.65):
    # 分环抛物面与实际边框，背面支座和馈源撑杆保留，不是平面圆片。
    count=40;rings=8;vertices=[(0,0,0)];faces=[]
    for ring in range(1,rings+1):
        r=radius*ring/rings
        for i in range(count):vertices.append((r*math.cos(i*math.tau/count),r*math.sin(i*math.tau/count),.55*(r/radius)**2))
    for i in range(count):faces.append((0,1+i,1+(i+1)%count))
    for ring in range(rings-1):
        for i in range(count):
            if q.abandoned and ring>=5 and 5<=i<=8:continue
            a=1+ring*count+i;b=1+ring*count+(i+1)%count
            faces.append((a,b,b+count,a+count))
    mesh=q.bpy.data.meshes.new('卫星锅抛物面');mesh.from_pydata(vertices,[],faces);mesh.update();mesh.materials.append(q.trim)
    obj=q.own(q.bpy.data.objects.new('卫星接收锅',mesh));obj.location=(x,y,z);obj.rotation_euler.y=turn
    solid=obj.modifiers.new('锅面薄壳','SOLIDIFY');solid.thickness=.05
    rot=obj.rotation_euler.to_matrix();center=q.Vector((x,y,z))
    def world(p):return center+rot@q.Vector(p)
    for i in range(count):
        a=i*math.tau/count;b=(i+1)*math.tau/count
        if not(q.abandoned and 5<=i<=8):q.beam('卫星锅边框',world((radius*math.cos(a),radius*math.sin(a),.55)),world((radius*math.cos(b),radius*math.sin(b),.55)),.035,q.steel)
    for i in range(3):
        a=i*math.tau/3
        q.beam('馈源支撑',world((radius*.85*math.cos(a),radius*.85*math.sin(a),.4)),world((0,0,1.55)),.035,q.steel)
    q.beam('馈源头',world((0,0,1.45)),world((0,0,1.8)),.12,q.blue)
    q.cylinder('锅面支座',(x,y,z-1.8),.2,2.4,q.steel,16)


def build(q):
    q.site();q.box('通信服务场地',(0,8,.16),(65,68,.22),q.paving,.03)
    q.building('通信设备楼',6,-2,35,20,7.8,2,spacing=4.5)
    q.entrance(6,-12.2,5,2.9);q.text('COMMUNICATIONS',6,-14.1,4.5,.5)
    dish(q,-1,-1,11.2,2.8,.7)
    q.box('通信楼蓝灰竖带',(-9,-12.28,4.4),(.7,.15,7.6),q.blue,.02)
    # 35米格构塔：四腿、逐层收分、每面交叉撑与检修平台。
    tower=q.material('communications_tower','#946e52',.68,.3)
    x,y=-23,20
    for sx in (-1,1):
        for sy in (-1,1):
            q.box('通信塔独立基础',(x+sx*2.8,y+sy*2.8,.4),(1.6,1.6,.8),q.concrete,.06)
            for dx in (-.4,.4):q.cylinder('塔脚锚栓',(x+sx*2.8+dx,y+sy*2.8,.9),.04,.25,q.chrome,10)
    for level in range(8):
        z0=.8+level*4.2;z1=z0+4.2;r0=2.8-level*.27;r1=r0-.27
        corners=[(-1,-1),(1,-1),(1,1),(-1,1)]
        lower=[(x+sx*r0,y+sy*r0,z0) for sx,sy in corners];upper=[(x+sx*r1,y+sy*r1,z1) for sx,sy in corners]
        for i in range(4):
            j=(i+1)%4
            q.beam('格构塔主弦杆',lower[i],upper[i],.10,tower)
            q.beam('格构塔横杆',upper[i],upper[j],.06,tower)
            if not(q.abandoned and level==6 and i==1):
                q.beam('格构塔交叉撑',lower[i],upper[j],.045,tower);q.beam('格构塔交叉撑',lower[j],upper[i],.045,tower)
        if level in (2,5,7):
            q.box('检修平台',(x,y,z1),(r1*2+.9,r1*2+.9,.12),q.steel,.02)
            for side in (-1,1):q.beam('平台护栏',(x-r1-.4,y+side*(r1+.4),z1+1),(x+r1+.4,y+side*(r1+.4),z1+1),.035,q.steel)
    for side in (-1,1):q.beam('检修梯竖梁',(x+side*.34,y-.4,.8),(x+side*.34,y-.4,34),.035,q.steel)
    for i in range(80):q.box('塔内检修梯',(x-.2,y-.4,.8+i*.4),(.65,.06,.05),q.steel,.005)
    for index,z in enumerate((18,25,31)):
        for face in range(3):
            angle=face*math.tau/3;px=x+math.cos(angle)*2.3;py=y+math.sin(angle)*2.3
            q.beam('天线挂臂',(x,y,z),(px,py,z),.075,q.steel)
            panel=q.box('板状通信天线',(px,py,z),(.35,.8,2.3),q.trim,.09,turn=angle)
            if q.abandoned and index==2 and face==0:panel.rotation_euler.x=.45
    dish(q,-25,20,17.4,1.05,1.25)
    q.beam('微波锅安装支臂',(x,20,15.6),(-25,20,15.6),.12,q.steel)
    q.building('备用电源房',23,27,10,8,3.4,1)
    for xx in (8,15):
        q.box('备用机柜',(xx,27,1.6),(3.0,4,2.7),q.concrete,.06)
        for i in range(9):q.box('机柜通风格栅',(xx-1.52,25.4+i*.4,1.7),(.03,.10,1.9),q.steel,.005)
    q.box('进场通道',(6,-31,.19),(9,21,.23),q.paving,.03)
    for x,y in ((-20,-17),(26,-15),(29,30),(-29,32)):q.streetlight(x,y,6)
    q.car(26,-22,0)
    if q.abandoned:q.rubble(27,3,4,4,16);q.weeds(0,16,65,45,75)
    q.people([(6,-20),(20,20),(-18,14),(26,-28)])


def damage(q,d):
    """设备楼一端塌陷，塔身上段折弯和废弃设备对应通信设施身份。"""
    from mathutils import Matrix,Euler,Vector
    d.cut(q,'通信设备楼东端坍塌',(17,0,16,25),2.3,('通信设备楼',))
    d.heap(q,17,0,14,19,2.7,85,.65);d.heap(q,23,-12,10,8,1.6,50)
    d.sheet(q,'设备楼坠落屋面',(14,0,3.3),(8,8),(.2,.4,.15))
    d.broken_wall(q,'通信楼断墙',17,-11.8,12,2.2,.7)
    # 下部主塔保持定位，上部沿真实节点折弯；天线/平台一起变形。
    q.bpy.context.view_layer.update();pivot=Vector((-23,20,26.0))
    transform=Matrix.Translation(pivot)@Euler((.15,-.27,.03),'XYZ').to_matrix().to_4x4()@Matrix.Translation(-pivot)
    for obj in list(q.source.objects):
        if obj.type!='MESH' or not obj.name.startswith(('格构塔','天线挂臂','板状通信','检修平台','平台护栏','塔内检修梯')):continue
        if min((obj.matrix_world@Vector(v)).z for v in obj.bound_box)>=25.9:obj.matrix_world=transform@obj.matrix_world
    d.wall_dirt(q,0,-12.24,20,3.5)
    d.trash(q,18,24,12,7,28);d.trash(q,-15,-16,10,6,26)
    d.patch(q,'设备检修区积尘',0,25,24,12,.282,q.damage_dust)
    d.sheet(q,'掉落机柜检修板',(10,23,.6),(2.7,2.2),(.15,.1,.4),True)
    q.beam('脱落通信线缆',(10,23,.35),(18,18,.4),.025,q.dark)
