// 品质POI仅供独立样板页；尺寸是园区米制参考，不生成主地图对象。
export const QUALITY_POIS=[
  {id:'school',name:'学校',footprint:[120,160],sheet:'01-civic-life',description:'三层教学楼、行政翼、体育馆与篮球场；废弃、修复、接通三态同址对照。体育馆局部缺损可见内部桁架。'}
];
export const poiState=state=>({ruined:'abandoned',intact:'intact',operating:'connected'})[state];
