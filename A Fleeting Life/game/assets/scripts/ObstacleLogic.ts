import type { ObstacleDefinition, ObstacleKind } from './Content';
import { PLAYER_X, RUN_SPEED, obstacleBounds, playerBodyBounds, worldX, type Rect } from './Geometry';

export type ObstacleSource = 'vehicle'|'cabinet'|'banner'|'ball'|'bicycle'|'satchel'|'step'|'bucket'|'books'|'crate'|'bench'|'lamp'|'rack'|'awning'|'rubble';
export type ObstacleMotion = 'fixed'|'door'|'cabinetDoor'|'lowerBanner';
export interface WorldObstacle extends ObstacleDefinition {
  done?:boolean; erased?:boolean;
  /** Latched event state, measured in real seconds, never a screen-coordinate switch. */
  eventElapsed?:number; cueSeen?:boolean; triggerLead?:number;
}
export interface ObstacleAppearance {
  source:ObstacleSource; motion:ObstacleMotion; explanation:string;
}
export interface ObstacleFrame {
  x:number; bounds:Rect; progress:number; collidable:boolean; source:ObstacleSource; motion:ObstacleMotion;
}
export const OBSTACLE_NOTICE_SECONDS=3.2;
export const OBSTACLE_EVENT_LEAD_SECONDS=2.6;
export const OBSTACLE_EVENT_SECONDS=.55;

/** Every authored label has a physical source; fixed props already exist in the street. */
export function obstacleAppearance(label:string,kind:ObstacleKind):ObstacleAppearance {
  if(/车门/.test(label))return {source:'vehicle',motion:'door',explanation:'停靠在路边的车先可见，乘客开门后门板伸入路面。'};
  if(/储物柜门/.test(label))return {source:'cabinet',motion:'cabinetDoor',explanation:'储物柜固定在走廊边，柜门从合拢状态慢慢打开。'};
  if(/低下来的.*横幅/.test(label))return {source:'banner',motion:'lowerBanner',explanation:'横幅原本系在两根支架上，一侧绳扣松动后慢慢下垂。'};
  if(/球/.test(label))return {source:'ball',motion:'fixed',explanation:'球已放在地面上，随场景接近，无瞬间生成。'};
  if(/自行车/.test(label))return {source:'bicycle',motion:'fixed',explanation:'自行车倒放在路边，车架和轮子先可见。'};
  if(/书包/.test(label))return {source:'satchel',motion:'fixed',explanation:'书包已放在路面上，可见背带和提手。'};
  if(/拖把桶|扫帚|簸箕/.test(label))return {source:'bucket',motion:'fixed',explanation:'保洁工具放在墙边，桶、扫帚或簸箕接触地面。'};
  if(/倒塌|断砖/.test(label))return {source:'rubble',motion:'fixed',explanation:'余烬里原有的断墙与横梁可见，障碍连着废墟结构。'};
  if(/旧箱|木箱|纸箱|箱子|杂物|砖|高台|课桌/.test(label))return {source:'crate',motion:'fixed',explanation:'箱子、低台或收拢的家具已堆放在地面上，底部有接地阴影。'};
  if(/台阶|门槛/.test(label))return {source:'step',motion:'fixed',explanation:'台阶连着建筑入口，门槛连着门框。'};
  if(/台灯/.test(label))return {source:'lamp',motion:'fixed',explanation:'台灯横臂连着灯柱和底座，横臂伸到行走路径。'};
  if(/长椅|椅背|折叠椅|第二排椅|倒下的椅子/.test(label))return {source:'bench',motion:'fixed',explanation:'长椅或椅背连着座板与后方椅脚，碰撞部分为横向背板。'};
  if(/雨棚|晾伞|晾衣|屋檐/.test(label))return {source:'awning',motion:'fixed',explanation:'雨棚、晾衣杆固定在墙面和支撑架上。'};
  if(/纪念册|横幅|成绩单|奖状|告示牌/.test(label))return {source:'banner',motion:'fixed',explanation:'纸张或横幅由绳子和展示架托住，并非悬空方块。'};
  if(/参考书|作业本|练习册|字典|书堆|一摞|摞书|软垫|相册/.test(label))return {source:'books',motion:'fixed',explanation:'书本或软垫逐层堆在地面或低台上。'};
  return {source:'rack',motion:'fixed',explanation:'横杆、横架或器材连着后方立柱和固定底座。'};
}

/** Time until the first solid edge reaches a standing runner, using current travel speed. */
export function obstacleContactSeconds(o:WorldObstacle,time:number,pixelsPerSecond:number){
  const b=physicalObstacleBounds(o,worldX(o.at,time)),runner=playerBodyBounds(0,'run');
  return (b.x-(runner.x+runner.w))/Math.max(1,pixelsPerSecond);
}

function physicalObstacleBounds(o:WorldObstacle,x:number):Rect {
  const bounds=obstacleBounds(o.kind,x);
  const source=obstacleAppearance(o.label,o.kind).source;
  // The shifted vehicle's driver's door hinges at x+5. Its open leaf spans
  // x-8..x+5; the outer bottom corner reaches the pavement at y=216.
  if(source==='vehicle')return {x:x-8,y:164,w:13,h:52};
  if(source==='cabinet')return {x:bounds.x,y:156,w:bounds.w,h:37};
  return bounds;
}

export function advanceObstacleEvent(o:WorldObstacle,time:number,pixelsPerSecond:number,dt:number){
  if(o.erased||o.done)return;
  const appearance=obstacleAppearance(o.label,o.kind);
  if(appearance.motion==='fixed')return;
  const eta=obstacleContactSeconds(o,time,pixelsPerSecond);
  if(eta<=OBSTACLE_NOTICE_SECONDS)o.cueSeen=true;
  if(o.eventElapsed===undefined&&eta<=OBSTACLE_EVENT_LEAD_SECONDS){
    o.eventElapsed=0;o.triggerLead=eta;
  }
  if(o.eventElapsed!==undefined)o.eventElapsed+=Math.max(0,dt);
}

export function obstacleFrame(o:WorldObstacle,time:number):ObstacleFrame {
  const appearance=obstacleAppearance(o.label,o.kind),x=worldX(o.at,time);
  const raw=appearance.motion==='fixed'?1:Math.min(1,Math.max(0,(o.eventElapsed??0)/OBSTACLE_EVENT_SECONDS));
  const progress=raw*raw*(3-2*raw);
  const bounds=physicalObstacleBounds(o,x);
  return {x,bounds,progress,collidable:appearance.motion==='fixed'||progress>=.995,
    source:appearance.source,motion:appearance.motion};
}

/** Partial routes omit a dynamic event unless it still has its complete visible warning. */
export function prepareObstacle(o:ObstacleDefinition,startAt=0,pixelsPerSecond=RUN_SPEED):WorldObstacle|null {
  const copy:WorldObstacle={...o};
  if(o.at<startAt+.8)return null;
  if(obstacleAppearance(o.label,o.kind).motion!=='fixed'&&
    obstacleContactSeconds(copy,startAt,pixelsPerSecond)<OBSTACLE_NOTICE_SECONDS)return null;
  return copy;
}

export function obstacleVisible(o:WorldObstacle,time:number){
  const x=PLAYER_X+(o.at-time)*RUN_SPEED;
  return x>-100&&x<580;
}
