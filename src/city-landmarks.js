// 单体模型的真实园区尺寸与城市分区；此轮仅作保留地标，不增加经营系统。
export const CITY_LANDMARKS=[
  {id:'cityhall',name:'市政厅',meters:[120,140],x:.49,y:.46,side:'west',file:'cityhall-quality/city-hall-abandoned',reason:'中央主干道旁的行政中心，入口面向道路'},
  {id:'police',name:'警察局',meters:[80,100],x:.53,y:.49,side:'east',file:'police-quality/police-abandoned',reason:'靠近行政中心与主干路，便于覆盖城区'},
  {id:'school',name:'学校',meters:[120,160],x:.36,y:.77,side:'west',file:'school-quality/school-abandoned',reason:'南部住宅腹地，避开铁路和工业厂区'},
  {id:'athletics',name:'操场',meters:[160,120],x:.40,y:.77,side:'west',file:'athletics-quality/athletics-abandoned',reason:'与学校位于同一教育片区，各自保留临街入口'},
  {id:'supermarket',name:'超市',meters:[80,100],x:.57,y:.84,side:'east',file:'supermarket-quality/supermarket-abandoned',reason:'住宅片区临街节点，服务日常采购'},
  {id:'fire-station',name:'消防站',meters:[60,80],x:.52,y:.71,side:'east',file:'fire-station-quality/fire-station-abandoned',reason:'住宅与主干道交接处，保留车辆出入口'},
  {id:'shelter',name:'避难所',meters:[60,80],x:.44,y:.91,side:'west',file:'shelter-quality/shelter-isolated',reason:'靠近南侧营地与居住区的既有应急设施'},
  {id:'railway',name:'火车站',meters:[180,100],x:.66,y:.06,side:'east',file:'railway-quality/railway-abandoned',reason:'北侧城边交通门户，站后双轨沿东西方向延伸'},
  {id:'logistics',name:'物流中心',meters:[140,160],x:.73,y:.09,side:'east',file:'logistics-quality/logistics-abandoned',reason:'车站附近的货运片区，货车不穿越学校和住宅中心'},
  {id:'power',name:'发电站',meters:[160,180],x:.90,y:.19,side:'east',file:'power-quality/power-abandoned',reason:'东北工业边缘，远离学校、居住和行政核心'},
  {id:'waterworks',name:'水厂',meters:[120,140],x:.83,y:.55,side:'east',file:'waterworks-quality/waterworks-abandoned',reason:'河道北岸的市政水处理用地；未假设具体上下游与取水工艺'},
  {id:'communications',name:'通信中心',meters:[80,100],x:.15,y:.32,side:'west',file:'communications-quality/communications-abandoned',reason:'西侧低密边缘，塔周保留自己的园区退界'}
];
export const landmarkById=id=>CITY_LANDMARKS.find(p=>p.id===id);
