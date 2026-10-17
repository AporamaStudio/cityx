"""社区超市：大屋面采光带、沿街玻璃门厅、购物车棚和后勤卸货区。"""
from poi_logistics import truck
INFO={'name':'超市','footprint':[80,100],'mainBuilding':[50,30],'sheet':'03-city-services','landmarks':{'entrance':[0,-3],'store':[0,14],'carts':[-25,-18],'loading':[32,15]},'treeExclusions':[[25,0,40,30]]}


def cart(q,x,y):
    # 小车按约1m长度制作，线框篮筐和四轮在近景可检查。
    for side in (-1,1):
        q.beam('购物车底架',(x+side*.27,y-.45,.25),(x+side*.27,y+.45,.25),.022,q.chrome)
        q.beam('购物车立架',(x+side*.27,y+.3,.25),(x+side*.27,y+.5,1),.022,q.chrome)
        for yy in (-.37,.37):q.cylinder('购物车轮',(x+side*.27,y+yy,.16),.10,.07,q.tire,12).rotation_euler.y=1.5708
    q.beam('购物车把手',(x-.3,y+.5,1),(x+.3,y+.5,1),.035,q.blue)
    for i in range(7):
        yy=y-.35+i*.1
        q.beam('篮筐底丝',(x-.25,yy,.54),(x+.25,yy,.54),.009,q.chrome)
        for side in (-1,1):q.beam('篮筐竖丝',(x+side*.25,yy,.54),(x+side*.32,yy,.93),.009,q.chrome)
    for z in (.62,.76,.90):
        for side in (-1,1):q.beam('篮筐横丝',(x+side*.3,y-.35,z),(x+side*.3,y+.35,z),.009,q.chrome)
    for xx in (-.25,-.12,0,.12,.25):q.beam('篮筐前端丝',(x+xx,y-.35,.54),(x+xx,y-.35,.93),.009,q.chrome)


def build(q):
    q.site();q.box('超市前场',(0,-23,.17),(68,34,.22),q.asphalt,.03)
    q.building('超市主楼',0,14,50,30,6.7,1,windows=False)
    # 将屋顶空调移到后侧检修区，不能压在采光玻璃上。
    for obj in q.source.objects:
        if obj.name.startswith(('屋顶空调','空调散热格栅')):obj.location.y+=11
    # 面向社区的通透前立面，而不是办公楼等距小窗。
    q.box('门厅玻璃阴影',(0,-1.2,3.5),(28,.16,5.4),q.dark,.03)
    for i in range(8):q.window(-12.25+i*3.5,-1.34,3.3,w=3.2,h=4.9,lit=True,broken=q.abandoned and i in (2,6))
    q.box('商店入口雨棚',(0,-2.8,5.7),(29,3.8,.22),q.trim,.05)
    q.box('前庭人行道',(0,-5,.22),(54,5,.22),q.paving,.025)
    q.box('中央步行通道',(0,-23,.25),(4,35,.2),q.paving,.025)
    q.text('NEIGHBORHOOD MARKET',0,-4.72,5.9,.65,q.steel)
    q.box('入口照明带',(0,-4.0,5.5),(24,.18,.07),q.lamp,.015)
    for xx in (-10,0,10):q.light(xx,-4,5.2,150,15)
    # 屋顶采光带的玻璃/基框/分格有实体，俯视亦能区分接通。
    for xx in (-11,11):
        for j in range(4):
            if q.abandoned and xx==11 and j in (2,3):continue
            q.box('天窗基框',(xx,8+j*3.4,7.75),(5.0,3.2,.48),q.steel,.03)
            q.box('天窗玻璃',(xx,8+j*3.4,8.01),(4.65,2.85,.06),q.lit_glass,.02)
            q.box('天窗中梃',(xx,8+j*3.4,8.06),(.08,2.85,.06),q.frame_mat,.01)
    for x in (-21,-13,-5,5,13,21):
        for y in (-16,-28):
            for dx in (-1.8,1.8):q.box('超市停车位线',(x+dx,y,.30),(.09,6,.02),q.white,0)
    for index,(x,y) in enumerate(((-21,-16),(-13,-28),(-5,-16),(13,-16),(21,-28))):q.car(x,y,index%4)
    # 购物车棚与嵌套小车，不放大为建筑级物件。
    for yy in (-21,-15):
        for xx in (-29,-23):q.beam('购物车棚柱',(xx,yy,.2),(xx,yy,2.7),.06,q.steel)
    q.box('购物车棚雨盖',(-26,-18,2.85),(6.7,7,.14),q.blue,.04)
    for i in range(7):cart(q,-26,-20+i*.65)
    q.box('卸货侧院',(32,14,.18),(11,35,.22),q.paving,.03)
    truck(q,32,15,q.trim)
    q.box('卸货口门框',(25.18,22,2.7),(.20,4.6,4.8),q.dark,.03)
    q.box('卸货口卷帘',(25.32,22,2.7),(.08,4.2,4.4),q.blue,.025)
    for y in (34,39):
        q.box('分类回收箱',(24,y,1.0),(2.0,3,1.7),q.blue,.06)
        q.box('回收箱盖',(24,y,1.9),(2.1,3.1,.15),q.steel,.025)
    for x,y in ((-32,-32),(32,-32),(-30,0),(28,36)):q.streetlight(x,y,6)
    if q.abandoned:
        q.rubble(19,29,6,6,30);q.weeds(0,-23,65,32,80)
        for x,y in ((-4,-11),(20,-9),(-22,-33)):q.box('废弃包装杂物',(x,y,.4),(1.4,.9,.4),q.wood,.015,turn=.3)
    q.people([(-2,-7),(4,-7),(-26,-22),(-12,-22),(10,-31),(31,0)])


def damage(q,d):
    """大卖场右后屋面及外墙垮塌，散落货物与垃圾集中在入口和卸货区。"""
    d.cut(q,'卖场右后部坍塌',(16,21,23,24),1.6,('超市主楼',),('天窗',))
    d.heap(q,15,21,21,21,2.8,110,.7);d.heap(q,25,26,10,16,1.8,65,.3)
    for x,y,z,ry in ((10,17,2.6,.35),(19,25,1.9,-.2)):
        d.sheet(q,'卖场折落屋面',(x,y,z),(9,7),(.16,ry,.2))
    d.broken_wall(q,'卖场后勤残墙',24.7,19,19,2.6,.6,1.5708)
    # 大开口里保留被压倒的货架，避免只留下通用石块堆。
    for x,y in ((12,13),(16,19),(20,24)):
        q.box('垮塌区域货架背板',(x,y,1.5),(.12,4,1.5),q.rust,.015,turn=.2)
        for z in (.8,1.4,2):q.box('货架残留层板',(x+.3,y,z),(1.0,4,.07),q.steel,.012,turn=.2)
    d.trash(q,23,35,11,10,45);d.trash(q,-12,-7,13,5,34);d.trash(q,27,-6,9,7,32);d.trash(q,-25,-25,10,7,26)
    d.patch(q,'停车场失养积尘',8,-26,32,16,.32,q.damage_dust)
    d.wall_dirt(q,-18,-1.24,12,3.4)
    # 一辆购物车翻倒在入口，完整小车尺度约1m。
    before=set(q.source.objects);cart(q,0,0)
    from mathutils import Matrix,Euler,Vector
    matrix=Matrix.Translation(Vector((-15,-9,.6)))@Euler((0,1.2,.3),'XYZ').to_matrix().to_4x4()
    for obj in set(q.source.objects)-before:obj.matrix_world=matrix@obj.matrix_basis
