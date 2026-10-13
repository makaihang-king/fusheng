import type { ObstacleKind } from './Content';

/** Shared 480 × 270 playfield geometry. Coordinates are pixels from the top left. */
export interface Rect { x:number; y:number; w:number; h:number }
export type PlayerPose = 'run'|'jump'|'slide'|'dive';
export type ObstacleShape = {at:number;kind:ObstacleKind};
export type FragmentSpot = {at:number;height:number;value:number};

export const PLAYER_X=96;
export const GROUND_Y=216;
export const RUN_SPEED=72;
export const JUMP_VELOCITY=230;
export const GRAVITY=600;
export const CHAIR_HEIGHT=16;
export const CHAIR_TOP=GROUND_Y-CHAIR_HEIGHT;
export const CHAIR_WIDTH=28;
/** Tile 01's school door begins at source x=1800/2, after the tile's 960px world offset. */
export const PLAYGROUND_SIDE_DOOR_AT=(960+1800/2-PLAYER_X)/RUN_SPEED;

export const CHAIRS=[
  {at:6,start:4.6,end:7.1,label:'第一把'},
  {at:7.9,start:7.1,end:9.1,label:'第二把'},
  {at:9.8,start:9.1,end:10.6,label:'第三把'},
] as const;

/** Each choice prop starts beyond the right edge and travels with the scene. */
export const CHOICE_PROPS={
  wall: {at:6,width:48,height:32},
  umbrella: {at:7.2,width:30,height:20},
  exam: {at:6,width:31,height:8},
  piano: {at:6,width:80,height:68},
  bench: {at:6,width:40,height:38},
  door: {at:7.5,width:44,height:94},
  oldSelf: {at:6,width:24,height:42},
} as const;
export type ChoiceProp = keyof typeof CHOICE_PROPS;

export function worldX(at:number,time:number){return PLAYER_X+(at-time)*RUN_SPEED;}

export function choicePropBounds(kind:ChoiceProp,time:number):Rect {
  const prop=CHOICE_PROPS[kind],center=worldX(prop.at,time);
  return {x:center-prop.width/2,y:GROUND_Y-prop.height,w:prop.width,h:prop.height};
}

/** Only the solid part is collidable; thin strings and highlights are decoration. */
export function obstacleBounds(kind:ObstacleKind,x:number):Rect {
  if(kind==='high')return {x:x-14,y:181,w:28,h:12};
  if(kind==='tall')return {x:x-14,y:164,w:28,h:52};
  if(kind==='low')return {x:x-12,y:197,w:24,h:19};
  throw new Error(`Unsupported obstacle kind: ${kind}`);
}

/** Hands, hair, carried props, and the ends of a sliding shoe are decorative. */
export function playerBodyBounds(elevation:number,pose:PlayerPose):Rect {
  const size=pose==='slide'?{left:12,w:24,h:18}:pose==='dive'?{left:13,w:27,h:40}:
    pose==='jump'?{left:6,w:12,h:42}:{left:7,w:14,h:40};
  return {x:PLAYER_X-size.left,y:GROUND_Y-elevation-size.h,w:size.w,h:size.h};
}

export function footBounds(elevation:number):Rect {
  return {x:PLAYER_X-8,y:GROUND_Y-elevation-2,w:16,h:3};
}

export function overlaps(a:Rect,b:Rect){
  return a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;
}

export function chairSurface(index:number,time:number){
  const chair=CHAIRS[index],center=worldX(chair.at,time);
  return {index:index+1,center,rect:{x:center-CHAIR_WIDTH/2,y:CHAIR_TOP,w:CHAIR_WIDTH,h:5},
    active:time>=chair.start&&time<chair.end,label:chair.label};
}

export function jumpHeight(seconds:number){return JUMP_VELOCITY*seconds-GRAVITY*seconds*seconds/2;}

/**
 * Ordinary fragments live outside the player's obstacle response and landing
 * bands. The bands use the visible solid width, 72 px/s travel, an ascending
 * jump trajectory, and at least 180 ms for reaction or settling.
 */
export function pickupSafetyBand(obstacle:ObstacleShape){
  const solid=obstacleBounds(obstacle.kind,0);
  const pose:PlayerPose=obstacle.kind==='high'?'slide':'jump';
  const body=playerBodyBounds(0,pose);
  const contact=(solid.w+body.w)/2/RUN_SPEED;
  const reaction=.18;
  if(obstacle.kind==='high')return {start:obstacle.at-contact-reaction,end:obstacle.at+contact+reaction};
  if(obstacle.kind==='tall'){
    const secondJumpLead=Math.max(contact+.08,.38);
    const firstJumpLead=secondJumpLead+.27;
    const heightAtSecond=jumpHeight(.27);
    const descent=(JUMP_VELOCITY+Math.sqrt(JUMP_VELOCITY*JUMP_VELOCITY+2*GRAVITY*heightAtSecond))/GRAVITY;
    return {start:obstacle.at-firstJumpLead-reaction/4,end:obstacle.at+descent-secondJumpLead+reaction};
  }
  const height=GROUND_Y-solid.y;
  const rise=(JUMP_VELOCITY-Math.sqrt(JUMP_VELOCITY*JUMP_VELOCITY-2*GRAVITY*height))/GRAVITY;
  const lead=contact+rise+reaction;
  const landing=2*JUMP_VELOCITY/GRAVITY-lead;
  return {start:obstacle.at-lead,end:obstacle.at+Math.max(contact+reaction,landing+reaction)};
}

/** Stable IDs and value sequence remain in Game; this only chooses safe times. */
export function safeFragmentSpots(total:number,duration:number,obstacles:ObstacleShape[]):FragmentSpot[]{
  const values:number[]=[];let remaining=total;
  while(remaining>0){const value=values.length%3===1&&remaining>=3?3:1;values.push(value);remaining-=value;}
  let intervals:[number,number][]=[[2.7,duration-1]];
  for(const obstacle of obstacles){
    const band=pickupSafetyBand(obstacle),next:[number,number][]=[];
    for(const [start,end] of intervals){
      if(band.end<=start||band.start>=end){next.push([start,end]);continue;}
      if(band.start>start)next.push([start,band.start]);
      if(band.end<end)next.push([band.end,end]);
    }
    intervals=next;
  }
  const lengths=intervals.map(([a,b])=>b-a),available=lengths.reduce((a,b)=>a+b,0);
  if(available<values.length*.25)throw new Error('Not enough safe corridor for authored fragments');
  return values.map((value,index)=>{
    let distance=(index+.5)/values.length*available,at=duration-1;
    for(let i=0;i<intervals.length;i++){
      if(distance<=lengths[i]||i===intervals.length-1){at=intervals[i][0]+distance;break;}
      distance-=lengths[i];
    }
    return {at,height:[18,28,34,22][index%4],value};
  });
}

export function validateFragmentSpots(spots:FragmentSpot[],duration:number,obstacles:ObstacleShape[]){
  return spots.every(spot=>spot.at>=2.7&&spot.at<=duration-1&&spot.height>=18&&spot.height<=34&&
    obstacles.every(obstacle=>{const band=pickupSafetyBand(obstacle);return spot.at<=band.start||spot.at>=band.end;}));
}
