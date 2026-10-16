// 品质POI仅供独立样板页；尺寸是园区米制参考，不生成主地图对象。
export const QUALITY_POIS=[
  {id:'school',name:'学校',footprint:[120,160],sheet:'01-civic-life',description:'三层教学楼、行政翼、体育馆与篮球场；废弃、修复、接通三态同址对照。体育馆局部缺损可见内部桁架。'},
  {id:'athletics',name:'操场',footprint:[160,120],sheet:'01-civic-life',description:'缩编练习跑道、足球练习场、五排小看台、篮球场与更衣服务房。废弃保留场地结构，接通后场灯与入口照明恢复。'},
  {id:'railway',name:'火车站',footprint:[180,100],sheet:'02-infrastructure',description:'区域站厅、双站台/贯通双轨、四节静态列车与跨轨步行桥。废弃雨棚局部缺损、轨道锈蚀，接通后站厅与站台照明恢复。'},
  {id:'power',name:'发电站',footprint:[160,180],sheet:'02-infrastructure',description:'三跨主厂房、渐细烟囱、外露弯管、机组与变电院。三态同址对照，接通为检修和厂区照明，不实现供电系统。'},
  {id:'waterworks',name:'水厂',footprint:[120,140],sheet:'02-infrastructure',description:'三座开放沉淀池、双过滤池、管桥阀门、控制楼与泵房；废弃池水积污和栏杆缺损，接通后恢复维护区照明。'},
  {id:'logistics',name:'物流中心',footprint:[140,160],sheet:'02-infrastructure',description:'多跨仓库、六处装卸月台、采光带、货车/集装箱/托盘和叉车。三态同址，接通后月台与维护照明恢复，不新增物流模拟。'},
  {id:'fire-station',name:'消防站',footprint:[60,80],sheet:'03-city-services',description:'三车位消防库、两辆消防车、值班生活翼与训练塔。废弃车库局部屋面和卷帘受损，接通后车库/入口照明恢复；车辆为静态样件。'},
  {id:'police',name:'警察局',footprint:[80,100],sheet:'03-city-services',description:'现代公共办公楼、蓝灰玻璃入口、后勤翼与巡逻车小院。废弃版东端上层坍塌、断楼板与脏乱场地，修复与接通分开，不新增警务玩法。'}
];
export const poiState=state=>({ruined:'abandoned',intact:'intact',operating:'connected'})[state];
