"""消防站：三车位消防库、值班翼、训练塔与两辆实体消防车。"""
INFO={'name':'消防站','footprint':[60,80],'mainBuilding':[30,20],'sheet':'03-city-services','landmarks':{'entrance':[18,-8],'garage':[-6,5],'tower':[-23,25],'apron':[-6,-19]},'treeExclusions':[[-30,14,-17,35],[11,-7,30,18]]}


def engine(q,x,y):
    red=q.material('fire_engine_red','#ac5c4a' if not q.abandoned else '#805f4c',.55,.12)
    q.box('消防车底架',(x,y,.85),(2.5,8.2,.45),q.steel,.09)
    q.box('消防车驾驶室',(x,y-2.6,2),(2.48,2.6,2.3),red,.15)
    q.box('消防车风挡',(x,y-3.92,2.45),(2.1,.06,1),q.glass,.04)
    q.box('消防车器材厢',(x,y+1.1,2),(2.5,4.6,2.4),red,.10)
    for side in (-1,1):
        for j in range(3):
            q.box('器材卷帘柜',(x+side*1.27,y-.55+j*1.45,2),(.06,1.32,1.7),q.trim,.025)
            for z in (1.4,1.7,2,2.3,2.6):q.box('卷帘接缝',(x+side*1.31,y-.55+j*1.45,z),(.02,1.3,.025),q.steel,0)
        for yy in (-2.6,2.5):
            q.cylinder('消防车轮胎',(x+side*1.2,y+yy,.65),.48,.3,q.tire,24).rotation_euler.y=1.5708
            q.cylinder('消防车轮毂',(x+side*1.38,y+yy,.65),.30,.035,q.chrome,16).rotation_euler.y=1.5708
    for dx in (-.55,.55):q.beam('车顶梯侧梁',(x+dx,y-1.2,3.4),(x+dx,y+3.0,3.4),.045,q.chrome)
    for i in range(12):q.beam('车顶梯横档',(x-.55,y-1.1+i*.35,3.4),(x+.55,y-1.1+i*.35,3.4),.03,q.chrome)
    for dx in (-.8,.8):q.box('消防车前灯',(x+dx,y-3.96,1.55),(.5,.05,.2),q.white,.025)
    q.box('静态警示灯架',(x,y-2.6,3.3),(1.7,.35,.12),q.steel,.025)
    for dx in (-.6,.6):q.box('静态红灯罩',(x+dx,y-2.6,3.45),(.4,.32,.2),red,.04)


def build(q):
    q.site();q.box('消防出车硬地',(-5,-17,.19),(46,26,.23),q.paving,.03)
    q.box('车库基础',(-6,5,.35),(30.5,20.5,.6),q.brick,.04)
    for side in (-1,1):q.box('车库侧墙',(-6+side*15,5,4.9),(.35,20,9),q.red,.025)
    q.box('车库后墙',(-6,15,4.9),(30,.35,9),q.stone,.025)
    q.box('车库前墙上缘',(-6,-5,7.8),(30,.35,3.2),q.stone,.025)
    q.box('车库内部地板',(-6,5,.73),(29.5,19.5,.2),q.concrete,.025)
    for xx,ww in ((-19.95,2.1),(-11,3.7),(-1,3.7),(7.95,2.1)):
        q.box('车库实体门间墙',(xx,-5,3.4),(ww,.4,5.8),q.stone,.025)
    for i,cx in enumerate((-16,-6,4)):
        for side in (-1,1):q.box('车库门柱',(cx+side*3.2,-5,3.5),(.55,.65,6),q.trim,.03)
        q.text(str(i+1).zfill(2),cx,-5.4,7.0,.8)
        q.box('车库上方灯具',(cx,-5.55,6.3),(1.4,.16,.1),q.lamp,.02);q.light(cx,-7,6,160,16)
        for j in range(12):
            if q.connected and i<2 and j<9:continue
            if q.abandoned and i==2 and j in (0,1,2):continue
            door=q.box('消防车库卷帘',(cx,-5.16,.95+j*.43),(5.8,.12,.41),q.rust,.02)
            if q.abandoned and i==2:door.rotation_euler.y=.07
        q.beam('车库钢屋架',(cx,-4,9),(cx,14,9),.12,q.steel)
    for xx in range(6):
        for yy in range(4):
            if q.abandoned and xx in (4,5) and yy==2:continue
            q.box('车库屋面分片',(-18.5+xx*5,-2.5+yy*5,9.5),(4.97,4.97,.22),q.roof,.025)
    for x in (-21,9):q.box('车库女儿墙',(x,5,9.7),(.22,20,.6),q.trim,.02)
    q.building('值班生活翼',18,5,16,20,6.7,2)
    q.entrance(18,-5.2,4.5,2.7);q.text('FIRE RESCUE',18,-7.1,4.2,.5)
    q.building('训练塔',-23,25,5,5,17.4,4,spacing=5,windows=False,flat=False)
    # 训练塔是暗色训练开口与屋顶护栏，不沿用办公楼的亮窗/空调。
    for z in (3,7,11,15):
        q.window(-23,22.42,z,w=1.7,h=2.2,lit=False)
        q.window(-25.58,25,z,w=1.7,h=2.2,turn=1.5708,lit=False)
    q.box('训练塔顶平台',(-23,25,18.1),(5.5,5.5,.22),q.concrete,.03)
    for side in (-1,1):
        q.beam('训练塔顶护栏',(-25.6,25+side*2.6,19.2),(-20.4,25+side*2.6,19.2),.035,q.steel)
        q.beam('训练塔顶护栏',(-23+side*2.6,22.4,19.2),(-23+side*2.6,27.6,19.2),.035,q.steel)
        for yy in (22.4,25,27.6):q.beam('训练塔护栏立柱',(-23+side*2.6,yy,18.2),(-23+side*2.6,yy,19.2),.035,q.steel)
    for z in range(1,18):q.box('训练塔外梯',(-25.65,25,z),(.18,1.0,.07),q.steel,.01)
    q.box('训练塔红色竖带',(-23,22.42,9),(.65,.04,16),q.rust,.01)
    engine(q,-16,-16);engine(q,-6,-16)
    q.box('侧院休憩步道',(17,-20,.18),(12,15,.2),q.paving,.03)
    q.bench(17,-19);q.bed(17,-25,3,3);q.tree(17,-25,7)
    q.streetlight(25,-14);q.streetlight(-25,-15)
    if q.abandoned:q.rubble(8,15,5,5,20);q.weeds(-5,-17,45,25,65)
    q.people([(16,-10),(-13,-23),(-8,-22),(17,-20)])
