import { GameModel, ACHIEVEMENTS, ITEM_PRICES, COSMETICS } from './Model';
import { SEGMENTS, BRANCHES, POEMS, POEM_LOOK_BACK, ENDINGS, ENDING_MEDIA_SECONDS, ENDING_SEQUENCE_FRAMES, XIAOMAN_MOTION, XIAOMAN_GAIT, CHARACTER_ANIMATIONS } from './Content';
import { CORRIDOR_PIXEL_CELLS, corridorCellOccupied, corridorPoseBottom, type CorridorPose } from './CorridorPixels';
import type { ChapterSceneKey, MainChoiceId, ObstacleKind } from './Content';
import { Painter } from './Painter';
import { drawGame } from './Renderer';
import { CHOICE_AFTER, CHOICE_SCENES, choiceGuide, choicePreview, actionResponse, endingEchoRecords,
  fragmentMemoryCues, microResponse, sceneOpeningEcho, sceneStory, storyBeatsBetween, type EndingEcho } from './Narrative';
import { memoryReviewForSegment } from './MemoryBook';
import { SubtitleManager, type SubtitleSource } from './Subtitle';
import { advanceObstacleEvent, obstacleFrame, prepareObstacle, type WorldObstacle } from './ObstacleLogic';
import { CHAIRS, CHAIR_HEIGHT, GROUND_Y, PLAYER_X, PLAYGROUND_SIDE_DOOR_AT, RUN_SPEED, chairSurface, choicePropBounds, footBounds,
  obstacleBounds, overlaps, playerBodyBounds, safeFragmentSpots, worldX,
  type PlayerPose } from './Geometry';

export interface Hooks {
  sound?: (name:string)=>void;
  capture?: (kind:string)=>void;
  replay?: (active:boolean,onResult?:(success:boolean)=>void)=>void;
  setting?: (name:string,value:boolean)=>void;
  random?: ()=>number;
  hellCourse?: (json:string)=>void;
  exit?: ()=>void;
}
type Button = {x:number,y:number,w:number,h:number,label:string,action:()=>void,disabled?:boolean,immediate?:boolean};
export type CorridorFragment = {
  x:number; y:number; vx:number; vy:number; size:number; height:number;
  delay:number; groundY:number; detached:boolean; landed:boolean; alpha:number; sourceX:number; sourceY:number;
  sourcePose:CorridorPose; sourceFrame:number; sourceKey:string; hasPixels:boolean;
};
export type InteractionTarget = {kind:'wall'|'side'|'table',x:number,width:number,height:number,active:boolean};
export type InputRipple = {x:number,y:number,time:number,duration:number,kind:'deadZone'|'blocked'};
type Pickup = {id:string,at:number,height:number,value:number};
type Obstacle = WorldObstacle;
export type MemoryReplayStage = 'object'|'touchResponse'|'choice'|'response'|'poem';
export interface MemoryReplayState {
  segment:number; stage:MemoryReplayStage; elapsed:number; totalElapsed:number;
  selected:string; hasPen:boolean; touchResponse:string; response:string; poem:string; objectTouched:boolean;
}
const MEMORY_PIANO_LID={x:318,y:84,w:106,h:78};
const MEMORY_TOUCH_RESPONSES:Record<string,string>={
  homework:'指尖压住作业本的折角，纸页在手下轻轻作响。',
  door:'走过办公室门前，门缝里的光落在脚边。',
};
const BENCH_SIT_SECONDS=2;
const BENCH_SEAT_HEIGHT=16;
// The same rig timings drive low posture and its rise back to standing.
const SLIDE_RECOVERY_SECONDS=XIAOMAN_MOTION.slideRecoverySeconds;
const clone = (v:any)=>JSON.parse(JSON.stringify(v));
const clamp=(v:number,a:number,b:number)=>Math.max(a,Math.min(b,v));
/** A reproducible three-act course; one seed is chosen each time hell begins. */
export function makeHellCourse(seed:number):Obstacle[]{
  let state=seed>>>0;
  const next=()=>{
    state=(state+0x6d2b79f5)>>>0;
    let value=state;
    value=Math.imul(value^(value>>>15),value|1);
    value^=value+Math.imul(value^(value>>>7),value|61);
    return ((value^(value>>>14))>>>0)/0x100000000;
  };
  // At least 2.45 seconds separate adjacent hazards, even at opposite jitter limits.
  const times=[4.75,7.4,10.05,12.7,15.35,18,20.65,23.3,25.95];
  const course:Obstacle[]=times.map(at=>({
    at:Math.round((at+(next()-.5)*.2)*100)/100,
    kind:next()<.5?'low':'high',label:''
  }));
  for(const [start,end] of [[0,2],[2,6],[6,9]]){
    const first=course[start].kind;
    if(course.slice(start,end).every(obstacle=>obstacle.kind===first))
      course[end-1].kind=first==='low'?'high':'low';
  }
  for(const o of course)o.label=o.kind==='high'?'倒塌走廊的横梁':'路面断砖';
  return course;
}
export class Game {
  width=480; height=270; model:GameModel; hooks:Hooks;
  screen='hall'; phase='run'; panel=''; panelPage=0; private _paused=false;
  get paused(){return this._paused;}
  set paused(value:boolean){
    if(value&&!this._paused){
      this.checkpointFeedback='';
      if(this.screen==='play'&&this.model?.run.active)this.model.save();
    }
    this._paused=value;
  }
  clock=0; time=0; phaseTime=0; sceneTime=0; duration=40; segment=1;
  openingMusicDelay=0;
  level:any=null; branch=''; startAt=0; theme='dawn'; title='回廊';
  y=0; vy=0; jumps=0; slide=0; slideRecovery=0; glide=0; diving=false; runSpeed=RUN_SPEED;
  obstacles:Obstacle[]=[]; hellObstacles:Obstacle[]=[]; pickups:Pickup[]=[]; used=new Set<string>();
  buttons:Button[]=[]; notice=''; noticeTime=0; subtitle=''; subtitleTime=0;
  exitConfirm=false;checkpointFeedback='';lastRetryFeedback='';retryCount=0;retryFeedbackTime=0;
  benchSitRemaining=0;
  subtitles=new SubtitleManager(); managedSubtitle='';
  memoryCue=''; memoryCueTime=0; memoryQueue:string[]=[]; endingEchoes:EndingEcho[]=[];
  memoryReplay:MemoryReplayState|null=null;
  private openingEchoShown=new Set<number>();
  private sceneLinesShown=new Set<string>();
  choice=0; choiceResult=''; seat=0; chairFreezeTime=0; hold=0; held=false; pointer:any=null;
  transition:any=null; returnScene:any=null; reward=''; rewardGround=false; chain=0; rewardHits=0; rewardSprintAt=30;
  ending=''; replayEnding=false; endingSnapshot:any=null; finaleTime=0;
  endingMediaActive=false;
  endingPlaybackToken=0;
  endingMediaClock:number|null=null;
  endingMediaStatus:'pending'|'loading'|'playing'|'ended'|'failed'='pending';
  private _endingMediaEnded=false;
  get endingMediaEnded(){return this._endingMediaEnded;}
  endingFallbackFrames=new Set<number>();
  endingFallbackBlocked=false;
  endingFallbackAvailable=false;
  private finaleReplayToken=0;private finaleReplayStopped=false;private finaleReplayEndAt:number|null=null;
  particles:any[]=[]; lastAction=''; actionTime=0; flash=0; shake=0; hurtPulse=0; protectionPulse=0;
  chalks:{at:number,text:string}[]=[]; settings={muted:false,reducedMotion:false};
  lastScore:any=null; completedIntro=false; replayTutorial=false; returnAnimation=0; selectedChapter=1;
  corridorTransitionTime=0;
  corridorTransitionDuration=8.6;
  // The model keeps walking while its source tiles shed.  Keeping this on the
  // game state lets rendering and QA use the same authored timeline.
  corridorWalkDuration=6.6;
  corridorDoorX=40;
  corridorFragments:CorridorFragment[]=[];
  inputRipples:InputRipple[]=[]; scoreTime=0;
  geometryDebugAllowed=false; debugGeometry=false; geometryEvents:string[]=[];
  readonly inputBufferSeconds=.12; readonly coyoteSeconds=.10;
  jumpBuffer=0; downBuffer=0; coyoteTime=0;
  private leftSurface=false;
  private accumulator=0; private keyHeld=new Set<string>(); private storage:any;
  constructor(storage:{load:()=>string|null,save:(json:string)=>void},hooks:Hooks={}){
    this.storage=storage; this.hooks=hooks;
    // Collision telemetry is textual only; player builds never expose geometry overlays.
    this.geometryDebugAllowed=false;
    let data:string|undefined; try{data=storage.load()||undefined;}catch{}
    this.model=new GameModel(data,(json:string)=>{try{storage.save(json);}catch(error){this.toast('存档空间暂不可用，请保持游戏窗口开启。');throw error;}});
    const p:any=this.model.profile;
    this.settings={muted:!!p.settings?.muted,reducedMotion:!!p.settings?.reducedMotion};
    this.completedIntro=!!p.progress?.introSeen;
  }
  get run():any{return this.model.run;}
  get profile():any{return this.model.profile;}
  get checkpointState(){
    const checkpoint=this.model.profile.checkpoint;
    const scene=checkpoint?(SEGMENTS as any[]).find(scene=>String(scene.id)===checkpoint.segment)||(BRANCHES as any)[checkpoint.segment]:null;
    return {available:!!scene,saved:!!scene&&!this.model.lastSaveError,failed:this.model.lastSaveError,
      location:scene?scene.name+(checkpoint!.startAt>0?' · 返回处':' · 起点'):'',
      detail:checkpoint?.startAt? '重开从此段返回处继续。':'重开从本段起点继续。'};
  }
  saveCheckpoint():boolean{
    if(!this.model.profile.checkpoint){
      const saved=this.model.save();
      this.checkpointFeedback=saved?'已解锁的记忆已保存。':'保存未成功，请稍后重试。';
      if(saved)this.toast(this.run.active&&!this.replayEnding?'进入跑段后，会自动保存到段首。':'已解锁的记忆已保存。');
      return saved;
    }
    const saved=this.model.save();
    this.checkpointFeedback=saved?'存档点已保存，可放心休息。':'保存未成功，请稍后重试。';
    if(saved)this.toast('已保存至：'+this.checkpointState.location+'。重开从这里继续。',4);
    return saved;
  }
  exitGame():boolean{
    if(!this.model.save()){
      this.checkpointFeedback='保存未成功，窗口已保留。';
      this.toast('保存未成功，暂未退出。请稍后重试。',5);return false;
    }
    this.hooks.exit?.();return true;
  }
  continueCheckpoint():boolean{
    if(this.screen!=='hall')return false;
    const checkpoint=this.model.resumeCheckpoint();if(!checkpoint)return false;
    this.cancelInput();this.accumulator=0;this.scoreTime=0;this.lastScore=null;this.resetRetrySchedule();
    this.clearStoryDisplay();this.endingEchoes=[];this.openingEchoShown.clear();this.sceneLinesShown.clear();
    this.replayEnding=false;this.endingSnapshot=null;this.memoryReplay=null;this.screen='play';this.panel='';this.paused=false;this.exitConfirm=false;
    this.ending='';this.reward='';this.transition=null;this.returnScene=null;this.sceneTime=0;this.particles=[];this.chalks=[];this.checkpointFeedback='';
    this.endingMediaActive=false;this.endingFallbackFrames.clear();this.hooks.replay?.(false);
    if(checkpoint.segment==='alley'||checkpoint.segment==='playground'){
      this.segment=checkpoint.segment==='alley'?1:2;this.beginBranch(checkpoint.segment);
    }else this.beginSegment(Number(checkpoint.segment),checkpoint.startAt);
    this.openingMusicDelay=.7;this.sound('door');this.toast('从存档点继续：'+this.checkpointState.location,3);
    return true;
  }
  sound(name:string){if(!this.settings.muted)this.hooks.sound?.(name);}
  toast(text:string,seconds=3){this.notice=text;this.noticeTime=seconds;}
  say(text:string,seconds=4,source:SubtitleSource='narrator',priority=3){
    this.subtitle=text;this.managedSubtitle=text;this.subtitleTime=seconds;
    this.subtitles.show(text,{lane:'story',source,priority,seconds});
  }
  showHeading(text:string,seconds=4){this.subtitles.show(text,{lane:'heading',source:'segment',priority:2,seconds});}
  showSceneStory(key:string|number,lead=''){
    const story=sceneStory(key as ChapterSceneKey);
    if(lead)this.say(lead,3.5,'choice',4);
    if(story){
      const anchorLine=this.level?.memoryAnchor?.line;
      this.subtitles.show(anchorLine?anchorLine+'\n'+story.objective:story.objective,
        {lane:'story',source:'narrator',priority:1,seconds:5});
      const guide=String(key)==='1'&&this.replayTutorial
        ?'轻点跳跃；下滑可滑铲或急坠。':story.guide||'';
      if(guide)this.subtitles.show(guide,{lane:'tutorial',source:'system',priority:1,seconds:String(key)==='1'&&!this.replayTutorial?9:6});
    }
  }
  showMemoryCue(text:string){
    if(!this.memoryCue){this.memoryCue=text;this.memoryCueTime=2.4;}
    else if(!this.memoryQueue.includes(text))this.memoryQueue.push(text);
  }
  private resetRetrySchedule(){
    if(this.lastRetryFeedback&&this.notice===this.lastRetryFeedback){this.notice='';this.noticeTime=0;}
    this.retryCount=0;this.lastRetryFeedback='';this.retryFeedbackTime=0;
  }
  collectStoryFragment(id:string,value:number){
    const before=this.run.segmentFragments;
    if(!this.model.collectFragment(id,value))return false;
    for(const cue of fragmentMemoryCues((this.branch||String(this.segment)) as ChapterSceneKey,before,this.run.segmentFragments))this.showMemoryCue(cue.text);
    return true;
  }
  clearStoryDisplay(){
    this.subtitles.clear();this.subtitle='';this.managedSubtitle='';this.subtitleTime=0;
    this.memoryCue='';this.memoryCueTime=0;this.memoryQueue=[];
  }
  /** A completed segment's interactive memory has no connection to the current run or save writer. */
  startMemoryReplay(segment:number):boolean{
    if(this.screen!=='hall'||!Number.isInteger(segment)||segment<1||segment>SEGMENTS.length||
       !memoryReviewForSegment(this.profile,String(segment)))return false;
    this.cancelInput();this.accumulator=0;this.clearStoryDisplay();
    this.memoryReplay={segment,stage:'object',elapsed:0,totalElapsed:0,selected:'',hasPen:false,
      touchResponse:'',response:'',poem:'',objectTouched:false};
    this.screen='memory';this.phase='memory';this.panel='';this.paused=false;this.exitConfirm=false;
    this.segment=segment;this.level=SEGMENTS[segment-1];this.branch='';this.theme=this.level.theme;
    this.title=this.level.name;this.time=0;this.phaseTime=0;this.sceneTime=0;this.y=0;this.vy=0;
    this.resetMovement();this.hold=0;this.scoreTime=0;this.lastScore=null;
    this.notice='';this.noticeTime=0;this.buttons=[];
    return true;
  }
  touchMemoryObject():boolean{
    const memory=this.memoryReplay;
    if(this.screen!=='memory'||this.paused||!memory||memory.stage!=='object')return false;
    memory.objectTouched=true;memory.elapsed=0;this.phaseTime=0;
    const anchor=SEGMENTS[memory.segment-1].memoryAnchor;
    memory.touchResponse=microResponse(anchor.id)||MEMORY_TOUCH_RESPONSES[anchor.id]||anchor.line;
    memory.stage='touchResponse';
    this.sound(anchor.sound);
    return true;
  }
  toggleMemoryPen():boolean{
    const memory=this.memoryReplay;
    if(this.screen!=='memory'||this.paused||!memory||memory.stage!=='choice'||memory.segment!==3)return false;
    memory.hasPen=!memory.hasPen;return true;
  }
  memoryVisibleChoiceIds():string[]{
    const memory=this.memoryReplay;if(this.screen!=='memory'||!memory||memory.stage!=='choice')return [];
    switch(memory.segment){
      case 1:return ['umbrella','alley'];
      case 2:return ['seat1','seat2','seat3','skipClass'];
      case 3:return memory.hasPen?['faceExam','cheat']:['faceExam','noPen'];
      case 4:return ['pianoPractice','pianoSmash'];
      case 5:return ['apologize','slamDoor'];
      case 6:return ['forward'];
      default:return [];
    }
  }
  chooseMemoryReplay(id:string):boolean{
    if(!this.memoryVisibleChoiceIds().includes(id))return false;
    return this.resolveMemoryChoice(id);
  }
  private resolveMemoryChoice(id:string):boolean{
    const memory=this.memoryReplay;
    if(this.screen!=='memory'||this.paused||!memory||memory.stage!=='choice'||memory.segment>6)return false;
    const outcome=CHOICE_SCENES[memory.segment as MainChoiceId].outcomes.find(choice=>choice.trigger.id===id);
    if(!outcome||id==='cheat'&&!memory.hasPen||id==='noPen'&&memory.hasPen||
       id==='back'&&!this.model.allLit())return false;
    memory.selected=id;memory.response=actionResponse(id)||outcome.response;
    memory.poem=(memory.segment===1&&id==='alley')||(memory.segment===2&&id==='skipClass')
      ? '' : id==='back'?POEM_LOOK_BACK:POEMS[memory.segment-1]||'';
    memory.stage='response';memory.elapsed=0;this.phaseTime=0;this.hold=0;this.held=false;
    this.sound('choice');return true;
  }
  returnFromMemoryReplay():void{
    const memory=this.memoryReplay;if(!memory)return;
    this.cancelInput();this.accumulator=0;this.clearStoryDisplay();this.memoryReplay=null;
    this.screen='hall';this.phase='run';this.panel='memoryBook';this.panelPage=-memory.segment;
    this.paused=false;this.exitConfirm=false;this.title='回廊';this.theme='dawn';this.level=null;
    this.branch='';this.time=0;this.phaseTime=0;this.sceneTime=0;this.resetMovement();
    this.notice='';this.noticeTime=0;this.buttons=[];
  }
  private stepMemory(dt:number):void{
    const memory=this.memoryReplay;if(!memory)return;
    memory.elapsed+=dt;memory.totalElapsed+=dt;this.phaseTime=memory.elapsed;this.sceneTime+=dt;
    if(memory.stage==='touchResponse'&&memory.elapsed>=(memory.segment===5?BENCH_SIT_SECONDS:1.8)){
      memory.stage=memory.segment===7?'response':'choice';
      if(memory.segment===7)memory.response='快门响前，许愿牌在手心里轻轻碰了一下。';
      memory.elapsed=0;this.phaseTime=0;
      return;
    }
    if(memory.stage==='choice'&&memory.segment===4&&this.held&&this.pointer&&!this.pointer.consumed){
      const pointer=this.pointer,fromKey=pointer.source==='key';
      const onLid=pointer.x>=MEMORY_PIANO_LID.x&&pointer.x<=MEMORY_PIANO_LID.x+MEMORY_PIANO_LID.w&&
        pointer.y>=MEMORY_PIANO_LID.y&&pointer.y<=MEMORY_PIANO_LID.y+MEMORY_PIANO_LID.h;
      if(fromKey||onLid){this.hold+=dt;if(this.hold>=.6){pointer.consumed=true;this.longPress();}}
    }
    if(memory.stage==='response'&&memory.elapsed>=3){
      if(memory.poem){memory.stage='poem';memory.elapsed=0;this.phaseTime=0;}
      else if(memory.totalElapsed>=10)this.returnFromMemoryReplay();
    }else if(memory.stage==='poem'&&memory.elapsed>=7)this.returnFromMemoryReplay();
  }
  capture(kind:string){if(this.screen!=='memory')this.hooks.capture?.(kind);}
  event(id:string,text=''){
    const accepted=this.model.event(id); if(accepted){
      this.storyEffect(id);this.sound('choice');this.lastAction=id;this.actionTime=1.1;
      const authored=actionResponse(id);if(authored||text)this.say(authored||text,4,
        Object.prototype.hasOwnProperty.call(CHOICE_AFTER,id)?'choice':'character',4);
    }
    return accepted;
  }
  storyEffect(id:string){
    if(id==='plane'){this.glide=2;this.vy=Math.max(this.vy,25);}
    if(id==='eraser'){const ahead=this.obstacles.find(o=>!o.done&&!o.erased&&o.at>this.time);if(ahead){ahead.erased=true;this.burst(96+(ahead.at-this.time)*72,200,'#ece4c9',6);}}
  }
  start(){
    if(this.screen==='memory')this.returnFromMemoryReplay();
    this.cancelInput();this.scoreTime=0;this.lastScore=null;
    this.resetRetrySchedule();
    this.replayTutorial=this.completedIntro;this.clearStoryDisplay();this.endingEchoes=[];
    this.openingEchoShown.clear();
    this.sceneLinesShown.clear();
    this.replayEnding=false;this.endingSnapshot=null;this.model.beginRun(); this.screen='play';this.panel='';this.paused=false;
    this.phase='intro';this.phaseTime=0;this.sceneTime=0;this.openingMusicDelay=0;this.theme='dawn';this.title='第一章 · 学堂';
    this.branch='';this.ending='';this.particles=[];this.resetMovement();this.chalks=[];this.benchSitRemaining=0;
    this.sound('door');this.showHeading(this.title,3);
    this.say('小满第一天上小学。路过的，是昨天还在的地方。',6);
  }
  beginSegment(n:number,startAt=0){
    this.cancelInput();
    this.resetRetrySchedule();
    this.segment=n;this.branch='';this.level=(SEGMENTS as any[])[n-1];this.phase='run';this.openingMusicDelay=0;
    this.sceneLinesShown.clear();
    this.theme=this.level.theme;this.title=this.level.name;this.time=startAt;this.phaseTime=0;
    this.duration=this.level.duration;this.startAt=startAt;this.resetMovement();this.benchSitRemaining=0;
    this.used=new Set();this.model.enterSegment(String(n),startAt);this.makeObjects();
    this.clearStoryDisplay();
    this.showHeading(this.title,4);
    this.showSceneStory(n);
    if(!this.openingEchoShown.has(n)){
      this.openingEchoShown.add(n);
      const echo=sceneOpeningEcho(n,this.run.events);
      if(echo)this.showMemoryCue(echo.text);
    }
    if(this.level.memoryAnchor?.sound)this.sound(this.level.memoryAnchor.sound);
  }
  beginBranch(id:string,lead=''){
    this.cancelInput();
    this.resetRetrySchedule();
    this.branch=id;this.level=(BRANCHES as any)[id];this.phase='run';this.time=0;this.phaseTime=0;
    this.sceneLinesShown.clear();
    this.duration=this.level.duration;this.theme=this.level.theme;this.title=this.level.name;
    this.startAt=0;this.resetMovement();this.benchSitRemaining=0;this.used=new Set();
    this.model.enterSegment(id);this.makeObjects();
    this.clearStoryDisplay();this.showHeading(this.title,4);this.showSceneStory(id,lead);
  }
  makeObjects(){
    this.obstacles=(this.level.obstacles||[]).map((o:any)=>prepareObstacle(o,this.startAt,this.worldTravelSpeed()))
      .filter((o:Obstacle|null):o is Obstacle=>o!==null);
    this.pickups=safeFragmentSpots(this.level.fragments,this.duration,this.level.obstacles||[])
      .map((spot,i)=>({id:String(this.run.segment)+':f'+i,...spot}))
      .filter(p=>p.at>=this.startAt);
  }
  beginChoice(n:number){
    this.cancelInput();
    this.phase='choice';this.choice=n;this.choiceResult='';this.phaseTime=0;this.resetMovement();
    this.hold=0;this.seat=0;this.chairFreezeTime=0;this.benchSitRemaining=0;this.obstacles=[];this.pickups=[];
    this.title=['','上学的路','教室 · 三把凳子','那张试卷','兴趣班 · 琴房','家长会之后','初中的岔路口'][n];
    this.duration=[0,8.4,10.6,7.2,7.5,8.4,this.model.allLit()?9:7.2][n];
    this.theme=['','dawn','dawn','noon','dusk','dusk','night'][n];
    this.clearStoryDisplay();this.showHeading(this.title,Math.min(4,this.duration));
    this.subtitles.show(choicePreview(n as MainChoiceId,{items:this.run.items,allLit:this.model.allLit()}),
      {lane:'story',source:'narrator',priority:2,seconds:this.duration});
    this.subtitles.show(choiceGuide(n as MainChoiceId,{items:this.run.items}),
      {lane:'tutorial',source:'system',priority:1,seconds:this.duration});
  }
  afterChoice(n:number,result:string){
    if(this.choiceResult)return;this.choiceResult=result;
    if(n===1){if(result==='alley'){this.event('alley');this.model.recordSegmentMemory('1');this.beginBranch('alley',actionResponse('alley'));}else{this.event('umbrella','有人把伞留在门口。');this.model.recordSegmentMemory('1');this.poem(0,()=>this.beginSegment(2));}}
    if(n===2){if(result==='skipClass'){this.event(result);this.model.recordSegmentMemory('2');this.beginBranch('playground',actionResponse(result));}else{this.event(result);this.model.recordSegmentMemory('2');this.poem(1,()=>this.beginSegment(3));}}
    if(n===3){this.event(result,result==='noPen'?'摸了摸口袋。那张没改成的五十九分，仍留在原处。':result==='cheat'?'笔尖落下。纸上少了一道缺口。':'分数留在纸上，你继续向前。');this.scoreSegment();this.model.recordSegmentMemory('3');this.poem(2,()=>this.beginSegment(4));}
    if(n===4){this.event(result,result==='pianoClose'?'琴盖轻轻落下。练习曲停在一个未完成的音。':result==='pianoSmash'?'最后一个音，响得太重。':'练完了。还有别的期待等着你。');this.model.recordSegmentMemory('4');if(result==='pianoClose')this.capture('hidden');this.poem(3,()=>this.beginSegment(5));}
    if(n===5){this.event(result,result==='apologize'?'低下头，话就从身边过去了。':'门在身后响了一声。');this.model.recordSegmentMemory('5');this.poem(4,()=>this.beginSegment(6));}
    if(n===6){if(result==='back'){this.event('back');this.model.recordSegmentMemory('6');this.capture('hidden');this.phase='reverse';this.phaseTime=0;this.duration=10;this.sound('reverse');}
      else {this.event('forward');this.model.recordSegmentMemory('6');this.poem(5,()=>this.beginSegment(7));}}
  }
  poem(index:number,next:()=>void){
    this.cancelInput();
    this.phase='poem';this.phaseTime=0;this.duration=8;this.transition=next;this.obstacles=[];this.pickups=[];
    const raw:any=(POEMS as any)[index];this.subtitle=typeof raw==='string'?raw:raw?.text||raw?.line||'';
    if(index===5&&this.run.events.includes('back'))this.subtitle='你把他留在了那里。\n他记得你回头看过。';
    this.subtitleTime=8;this.managedSubtitle=this.subtitle;
    this.subtitles.clear('heading');this.subtitles.clear('tutorial');
    this.subtitles.show(this.subtitle,{lane:'story',source:'narrator',priority:1,seconds:8});
    this.model.markSegmentPoem(index);
    this.title='';this.resetMovement();this.choice=index+1;
  }
  scoreSegment(){
    const reachable=this.startAt>0?this.pickups.reduce((n,p)=>n+p.value,0):this.level.fragments;
    this.lastScore=this.model.finishSegment(reachable);
    this.scoreTime=1.5;
    this.toast('脚印 · '+(this.lastScore.full?'碎片满罐 · ':'')+(this.lastScore.noHit?'未沾泥的鞋':'走过这一段'),1.5);
    if(this.lastScore.noHit)this.capture('highlight');
  }
  finishSegment(){
    if(this.segment!==3||this.branch)this.scoreSegment();
    if(this.branch==='alley'){this.cancelInput();this.phase='alleyExit';this.phaseTime=0;this.duration=7.2;this.title='巷子尽头';
      this.clearStoryDisplay();this.showHeading(this.title,3);this.say('窗台上有一道缺口。光从那里照进来。',3.5);return;}
    if(this.branch==='playground'){this.startEnding('runaway');return;}
    if(this.segment===4){this.cancelInput();this.resetMovement();this.phase='piano';this.phaseTime=0;this.duration=15;this.theme='dusk';this.title='兴趣班 · 练习';this.obstacles=[];this.pickups=[];
      this.clearStoryDisplay();this.showHeading(this.title,4);this.say('门外有人等你。练习曲只剩最后一行。',5);return;}
    if(this.segment===6){this.startReward();return;}
    if(this.segment===7){this.model.recordSegmentMemory('7');this.flash=1;this.sound('shutter');this.startEnding(this.model.determineEnding());return;}
    this.beginChoice(this.segment);
  }
  startReward(){
    this.cancelInput();
    this.reward=this.model.chooseReward();this.phase='reward';this.phaseTime=0;this.time=0;this.duration=60;
    this.theme=this.reward==='dream'?'dream':'heaven';this.title=this.reward==='dream'?'天上飘':'云海光柱';
    this.resetMovement(this.reward==='dream'?80:0);this.used=new Set();this.rewardGround=false;this.chain=0;this.rewardHits=0;this.rewardSprintAt=30;
    this.obstacles=[];this.pickups=[];this.clearStoryDisplay();this.showHeading(this.title,4);
    this.subtitles.show(this.reward==='dream'?'轻点上浮，下滑下沉。这里，落下也不会受伤。':'放心向光走去。这里的碰撞，会开出糖纸。',
      {lane:'tutorial',source:'system',priority:1,seconds:7});
  }
  startEnding(id:string,replay=false){
    this.cancelInput();
    this.endingMediaActive=false;
    this.endingPlaybackToken++;this.endingMediaClock=null;this.endingMediaStatus='pending';this._endingMediaEnded=false;
    this.endingFallbackFrames.clear();this.endingFallbackBlocked=false;this.endingFallbackAvailable=false;
    this.ending=id;this.replayEnding=replay;this.screen='play';this.phase='ending';this.phaseTime=0;this.time=0;
    const end:any=(ENDINGS as any)[id];this.duration=end?.duration||40;this.title=end?.name||id;
    this.theme=id==='backrow'?'gray':id==='desk'?'dusk':id==='secondGrade'?'dream':'dawn';
    // The cinematic street keeps its furniture in the background, away from the runner.
    this.obstacles=[];
    this.pickups=[];this.resetMovement();
    if(!replay)this.model.enterEnding(id);
    this.endingSnapshot=replay?this.profile.endingSnapshots?.[id]:clone(this.run);
    this.endingEchoes=endingEchoRecords(this.endingSnapshot?.events||this.run.events,2);
    this.clearStoryDisplay();this.sound('ending');
  }
  stepEnding(dt:number){
    this.time=this.phaseTime;
    if(this.phaseTime>=this.duration)this.finishEnding();
  }
  setEndingMediaProgress(seconds:number|null,status:'loading'|'playing'|'ended'|'failed'){
    if(this.phase!=='ending'||this.endingMediaEnded||this.endingMediaStatus==='failed')return;
    if(status==='ended'&&(seconds===null||!Number.isFinite(seconds)||seconds<ENDING_MEDIA_SECONDS-.15))status='failed';
    this.endingMediaStatus=status;
    if(seconds!==null&&Number.isFinite(seconds))this.endingMediaClock=clamp(seconds,0,ENDING_MEDIA_SECONDS);
    if(status==='ended'){
      this._endingMediaEnded=true;this.endingMediaClock=ENDING_MEDIA_SECONDS;this.phaseTime=ENDING_MEDIA_SECONDS;
      this.setEndingMediaActive(false);
    }else if(status==='failed'){
      // Restart the complete same-story fallback after incomplete or broken media.
      this.phaseTime=0;this.time=0;this.endingMediaClock=null;this.setEndingMediaActive(false);
      this.endingFallbackFrames.clear();this.endingFallbackBlocked=true;this.endingFallbackAvailable=false;
    }
  }
  setEndingFallbackProgress(index:number,visible:boolean){
    if(this.phase!=='ending'||this.endingMediaStatus!=='failed'||!Number.isInteger(index)||index<0||index>=ENDING_SEQUENCE_FRAMES)return;
    if(visible)this.endingFallbackFrames.add(index);else this.endingFallbackFrames.delete(index);
    this.endingFallbackAvailable=this.endingFallbackFrames.size>0;
    const current=Math.min(ENDING_SEQUENCE_FRAMES-1,Math.floor(this.phaseTime/ENDING_MEDIA_SECONDS*ENDING_SEQUENCE_FRAMES));
    if(index===current)this.endingFallbackBlocked=!visible;
  }
  retryEndingMedia(){
    if(this.phase!=='ending')return;
    this.endingPlaybackToken++;this.endingMediaClock=null;this.endingMediaStatus='pending';this._endingMediaEnded=false;
    this.endingFallbackFrames.clear();this.endingFallbackBlocked=false;this.endingFallbackAvailable=false;
    this.phaseTime=0;this.time=0;this.setEndingMediaActive(false);this.cancelInput();this.paused=false;
  }
  cancelEndingMedia(){
    if(this.phase!=='ending'||(!this.replayEnding&&!(this.endingMediaStatus==='failed'&&this.endingFallbackBlocked)))return;
    this.toHall();
  }
  finishEnding(){
    // A door lights only after its first scene has actually played through.
    if(!this.replayEnding&&this.phaseTime<this.duration)return;
    if(!this.replayEnding&&this.endingMediaStatus!=='ended'&&
      !(this.endingMediaStatus==='failed'&&this.endingFallbackFrames.size===ENDING_SEQUENCE_FRAMES))return;
    if(!this.replayEnding)this.model.finishEnding(this.ending);
    if(this.ending==='secondGrade'&&!this.profile.finalePlayed){
      this.phase='finale';this.phaseTime=0;this.finaleTime=0;this.finaleReplayStopped=false;this.finaleReplayEndAt=null;
      const token=++this.finaleReplayToken;
      this.hooks.replay?.(true,success=>{
        if(token!==this.finaleReplayToken||this.finaleReplayStopped||this.phase!=='finale')return;
        this.finaleReplayStopped=true;this.finaleReplayEndAt=Math.max(10,this.phaseTime);
        if(success&&!this.profile.finalePlayed){this.profile.finalePlayed=true;this.model.save();}
        this.hooks.replay?.(false);
      });
      return;
    }
    this.toHall(true);
  }
  private startCorridorTransition(){
    this.cancelInput();
    this.finaleReplayToken++;
    this.endingMediaActive=false;
    this.accumulator=0;this.scoreTime=0;this.benchSitRemaining=0;
    this.run.active=false;this.screen='play';this.phase='corridorTransition';this.paused=false;
    this.corridorTransitionTime=0;this.phaseTime=0;this.time=0;this.sceneTime=0;this.title='回到回廊';this.theme='dawn';
    this.panel='';this.exitConfirm=false;this.notice='';this.noticeTime=0;this.inputRipples=[];
    this.hurtPulse=0;this.protectionPulse=0;this.flash=0;this.shake=0;this.particles=[];this.lastAction='';this.actionTime=0;
    this.resetMovement();this.held=false;this.pointer=null;this.hold=0;this.buttons=[];
    this.clearStoryDisplay();this.endingEchoes=[];this.returnAnimation=0;
    const doorCenters:Record<string,number>={morning:110,backrow:184,outside:258,desk:332,secondGrade:414};
    this.corridorDoorX=doorCenters[this.ending]||40;
    let seed=0x7f4a7c15;
    const next=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/0x100000000;};
    this.corridorFragments=[];
    // 全部步行帧的覆盖格包含摆臂和迈腿区域，不能只裁待机轮廓。
    const size=this.settings.reducedMotion?8:4;
    const unique=new Set<string>();
    const sourcePose:CorridorPose='runStart',sourceFrame=0,bottom=corridorPoseBottom(sourcePose,sourceFrame);
    for(const cell of CORRIDOR_PIXEL_CELLS){
      const sourceX=Math.floor(cell[0]/size)*size;
      const sourceY=Math.floor(cell[1]/size)*size;
      const id=sourceX+':'+sourceY;if(unique.has(id))continue;unique.add(id);
      this.corridorFragments.push({
        x:this.corridorDoorX-XIAOMAN_MOTION.anchorX+sourceX,y:GROUND_Y-bottom+sourceY,
        vx:(next()-.5)*(this.settings.reducedMotion?8:26),vy:-6-next()*(this.settings.reducedMotion?8:18),
        // Start shedding before the walk is halfway over and finish before
        // the last few steps, so no stationary shedding phase remains.
        size,delay:1.15+(next()*.55+sourceY/44*.45)*5.3,groundY:GROUND_Y,
        height:Math.max(0,Math.min(size,bottom-sourceY)),
        detached:false,landed:false,alpha:1,sourceX,sourceY,sourcePose,sourceFrame,
        sourceKey:'',hasPixels:corridorCellOccupied(sourcePose,sourceFrame,sourceX,sourceY,size)
      });
    }
  }
  corridorActorX(time=this.corridorTransitionTime){
    const walk=clamp(time/this.corridorWalkDuration,0,1);
    const ease=walk*walk*(3-2*walk);
    return this.corridorDoorX+Math.min(80,450-this.corridorDoorX)*ease;
  }
  corridorActorFrame(time=this.corridorTransitionTime):{pose:CorridorPose,frame:number}{
    if(time>=this.corridorWalkDuration)return {pose:'idle',frame:0};
    const distance=this.corridorActorX(time)-this.corridorDoorX;
    const entry=CHARACTER_ANIMATIONS.runStart,travel=entry.frames/entry.fps*XIAOMAN_MOTION.runSpeed;
    if(distance<travel-1e-8)return {pose:'runStart',frame:Math.min(entry.frames-1,Math.floor(distance/travel*entry.frames))};
    return {pose:'run',frame:Math.floor((.5+(distance-travel)/XIAOMAN_GAIT.cycleTravel)*CHARACTER_ANIMATIONS.run.frames+1e-8)%CHARACTER_ANIMATIONS.run.frames};
  }
  corridorSourceKey(pose:CorridorPose,frame:number){
    const skin=this.profile.equippedSlots?.skin||this.profile.equipped;
    const stats=this.run.stats||{personality:50,relationship:50,will:50,appearance:50};
    let variant='';let strongest=19;
    for(const stat of ['personality','relationship','will','appearance'] as const){
      const distance=Math.abs(stats[stat]-50);if(distance>strongest){strongest=distance;variant=({personality:{low:'obedient',high:'rebel'},relationship:{low:'cheerful',high:'closed'},will:{low:'givingup',high:'persistent'},appearance:{low:'neat',high:'messy'}} as any)[stat][stats[stat]<50?'low':'high'];}
    }
    const name=String(frame).padStart(2,'0');
    if(variant&&(pose==='idle'||pose==='run'))return skin?`character.pixel.skin.${skin}.variant.${variant}.${pose}.${name}`:`character.pixel.variant.${variant}.${pose}.${name}`;
    return skin?`character.pixel.skin.${skin}.${pose}.${name}`:`character.pixel.${pose}.${name}`;
  }
  stepCorridorTransition(dt:number){
    this.corridorTransitionTime+=dt;this.phaseTime=this.corridorTransitionTime;this.sceneTime+=dt;
    const actor=this.corridorActorFrame(),bottom=corridorPoseBottom(actor.pose,actor.frame);
    for(const fragment of this.corridorFragments){
      if(!fragment.detached){
        fragment.x=this.corridorActorX()-XIAOMAN_MOTION.anchorX+fragment.sourceX;
        fragment.y=GROUND_Y-bottom+fragment.sourceY;
        fragment.height=Math.max(0,Math.min(fragment.size,bottom-fragment.sourceY));
        fragment.sourcePose=actor.pose;fragment.sourceFrame=actor.frame;
        // Keep the audited union attached while the actor walks. A cell may be
        // transparent in an intermediate gait frame, but it still belongs to
        // the moving body until the exact frame in which it detaches.
        fragment.hasPixels=fragment.height>0;
        if(this.corridorTransitionTime<fragment.delay)continue;
        fragment.detached=true;
        fragment.sourceKey=this.corridorSourceKey(actor.pose,actor.frame);
        fragment.hasPixels=fragment.height>0&&corridorCellOccupied(actor.pose,actor.frame,fragment.sourceX,fragment.sourceY,fragment.size);
        // 动画并集中的透明格不制造假碎片或地面阴影。
        if(!fragment.hasPixels){fragment.alpha=0;continue;}
      }
      if(!fragment.hasPixels)continue;
      if(!fragment.landed){
        fragment.x+=fragment.vx*dt;fragment.y+=fragment.vy*dt;fragment.vy+=90*dt;
        if(fragment.y+fragment.height>=fragment.groundY){
          fragment.y=fragment.groundY-fragment.height;fragment.vy=0;fragment.vx=0;fragment.landed=true;
        }
      }
      fragment.alpha=1-clamp((this.corridorTransitionTime-7.4)/1.2,0,1);
    }
    if(this.corridorTransitionTime>=this.corridorTransitionDuration)this.toHall(false);
  }
  private completeCorridorTransition(){
    this.corridorFragments=[];this.corridorTransitionTime=0;
    this.cancelInput();this.accumulator=0;this.scoreTime=0;this.benchSitRemaining=0;
    this.run.active=false;this.screen='hall';this.phase='run';this.panel='';this.paused=false;
    this.exitConfirm=false;this.title='回廊';this.theme='dawn';this.resetMovement();
    this.held=false;this.pointer=null;this.hold=0;this.buttons=[];this.returnAnimation=8;
    this.clearStoryDisplay();this.endingEchoes=[];this.hooks.replay?.(false);
  }
  toHall(animate=false){
    if(this.screen==='memory'){this.returnFromMemoryReplay();return;}
    if(this.phase==='corridorTransition'){this.completeCorridorTransition();return;}
    if(this.screen==='play'&&this.phase==='ending'&&!this.replayEnding&&this.phaseTime<this.duration&&
      !(this.endingMediaStatus==='failed'&&this.endingFallbackBlocked)){
      this.exitConfirm=false;this.paused=true;this.cancelInput();return;
    }
    if(animate){this.startCorridorTransition();return;}
    if(this.run.active)this.model.save();
    this.exitConfirm=false;
    this.finaleReplayToken++;
    this.cancelInput();this.endingMediaActive=false;this.accumulator=0;this.scoreTime=0;this.benchSitRemaining=0;
    this.run.active=false;this.screen='hall';this.phase='run';this.panel='';this.paused=false;this.title='回廊';this.theme='dawn';
    this.resetMovement();this.held=false;this.pointer=null;this.hold=0;this.buttons=[];this.returnAnimation=animate?8:0;
    this.clearStoryDisplay();this.endingEchoes=[];this.hooks.replay?.(false);
  }
  damage(){
    const hadShield=this.run.shield,hadLight=this.run.light;
    const result=this.model.damage();
    if(result==='ignored'){
      if((hadShield&&!this.run.shield)||(hadLight&&!this.run.light)){
        this.protectionPulse=.35;this.sound('item');this.traceGeometry('护盾或光挡住一次碰撞');
      }
      return;
    }
    this.traceGeometry('受击：剩余 '+this.run.lives+' 心，保护 '+this.run.invincible.toFixed(2)+' 秒');
    this.sound('hit');this.flash=.35;this.hurtPulse=.35;this.shake=.25;this.capture('death');
    if(result==='hit')return;
    if(result==='feather'){this.say('一根羽毛，托住了这一刻。',3);return;}
    if(result==='rewind'||result==='restart'){this.restart(result==='rewind');return;}
    if(result==='hell'){
      this.cancelInput();
      this.returnScene={phase:this.phase,time:this.time,phaseTime:this.phaseTime,theme:this.theme,title:this.title,y:this.y,used:Array.from(this.used)};
      // Keep the 28-second course readable while reshuffling all three acts.
      const draw=(this.hooks.random||Math.random)();
      const seed=Number.isFinite(draw)?Math.min(0xffffffff,Math.max(0,Math.floor(draw*0x100000000))):0;
      this.hellObstacles=makeHellCourse(seed);
      this.phase='hell';this.phaseTime=0;this.theme='hell';this.title='余烬';this.resetMovement();
      this.used=new Set();this.clearStoryDisplay();this.showHeading(this.title,4);
      this.say('脚下空了。先看清前方的影子，再向那盏灯跑。',5);
      try{this.hooks.hellCourse?.(JSON.stringify({seed,obstacles:this.hellObstacles.map(o=>({at:o.at,kind:o.kind}))}));}catch{}
    }
  }
  restart(rewind=false){
    this.cancelInput();
    this.benchSitRemaining=0;
    const obstacle=this.obstacles.find(o=>o.done&&!o.erased&&Math.abs(o.at-this.time)<.4);
    this.phase='run';this.time=this.startAt;this.phaseTime=0;this.openingMusicDelay=0;this.resetMovement();
    this.theme=this.level.theme;this.title=this.level.name;this.used=new Set();this.makeObjects();
    this.clearStoryDisplay();this.notice='';this.noticeTime=0;
    this.retryCount++;
    const retryLine=this.nextRetryFeedback(rewind,obstacle?.kind||'');
    this.lastRetryFeedback=retryLine;
    this.retryFeedbackTime=retryLine?(this.retryCount===1?2.2:this.retryCount===2?1.6:1):0;
    if(retryLine)this.toast(retryLine,this.retryFeedbackTime);
  }
  private nextRetryFeedback(rewind:boolean,kind:string):string{
    if(this.retryCount===5)return '路还在。';
    if(this.retryCount>2)return '';
    if(kind==='high')return this.retryCount===1?'横梁靠近时，下滑通过。':'再等横梁近些，下滑。';
    if(kind==='tall')return this.retryCount===1?'高物件靠近时，连跳两次。':'把第二次跳留给高处。';
    if(kind==='low')return this.retryCount===1?'低物件靠近时，轻点跳起。':'看准靠近的一刻再跳。';
    if(this.retryCount===1)return rewind?'回到起点，先看清下一件物件。':'先看清下一件物件，再动。';
    return '等它靠近些再动。';
  }
  jump(){
    if(this.screen!=='play'||this.paused||this.phase==='finale'||this.phase==='ending'||this.phase==='corridorTransition'||this.phase==='seat'||this.benchSitRemaining>0)return;
    if(this.phase==='intro'){if(this.completedIntro){this.beginSegment(1);this.openingMusicDelay=.7;}return;}
    if(this.phase==='reward'&&this.reward==='dream'&&this.phaseTime<30){this.vy=125;this.sound('jump');return;}
    if(this.jumps>=2&&this.coyoteTime<=0){this.jumpBuffer=this.inputBufferSeconds;return;}
    this.jumpBuffer=0;this.downBuffer=0;
    if(this.coyoteTime>0&&this.y>0)this.jumps=0;
    this.coyoteTime=0;this.leftSurface=false;
    this.used.delete('onTable');
    this.vy=this.phase==='reward'&&this.reward==='heaven'?260:
      this.phase==='alleyExit'&&this.jumps===1?280:XIAOMAN_MOTION.jumpVelocity;this.jumps++;this.run.jumps++;
    this.slide=0;this.slideRecovery=0;this.glide=0;this.diving=false;this.sound('jump');this.lastAction='jump';this.actionTime=.25;
  }
  down(){
    if(this.screen!=='play'||this.paused||this.phase==='finale'||this.phase==='ending'||this.phase==='corridorTransition'||this.phase==='seat'||this.benchSitRemaining>0)return;
    this.jumpBuffer=0;
    if(this.phase==='reward'&&this.reward==='dream'&&this.phaseTime<30){this.vy=-100;return;}
    if(this.phase==='reward'&&this.reward==='dream'&&this.phaseTime>=30&&this.used.has('onTable')){this.downBuffer=0;this.startSprint();this.vy=-120;return;}
    if(this.phase==='reward'&&this.reward==='dream'&&this.phaseTime>=30&&!this.used.has('sprint'))this.downBuffer=this.inputBufferSeconds;
    if(this.y>1){this.vy=XIAOMAN_MOTION.diveVelocity;this.diving=true;this.sound('dive');}
    else{this.slide=XIAOMAN_MOTION.slideSeconds;this.slideRecovery=0;this.sound('slide');
      if(this.phase==='reward'&&this.reward==='dream'&&this.phaseTime>=30){this.startSprint();}
    }
  }
  left(){
    if(this.phase==='corridorTransition')return;
    if(this.screen==='memory'&&!this.paused&&this.memoryReplay?.stage==='choice'&&
       this.memoryReplay.segment===6&&this.model.allLit()){this.resolveMemoryChoice('back');return;}
    if(this.screen==='play'&&!this.paused&&this.canLookBack())this.afterChoice(6,'back');
  }
  /** The former self can be addressed only after approaching from the far end of the road. */
  canLookBack(){
    if(this.phase!=='choice'||this.choice!==6||!this.model.allLit())return false;
    const former=choicePropBounds('oldSelf',this.phaseTime);
    return former.x<=PLAYER_X+140&&former.x+former.w>=PLAYER_X;
  }
  /** The lid belongs to the piano the runner is reaching, not to an empty room. */
  canTouchPiano(){
    if(this.phase!=='choice'||this.choice!==4)return false;
    const piano=choicePropBounds('piano',this.phaseTime);
    return piano.x<=PLAYER_X+60&&piano.x+piano.w>=PLAYER_X-14;
  }
  longPress(){
    if(this.phase==='corridorTransition')return false;
    if(this.screen==='memory'&&!this.paused&&this.memoryReplay?.stage==='choice'&&
       this.memoryReplay.segment===4){this.resolveMemoryChoice('pianoClose');return true;}
    if(this.canTouchPiano()){this.afterChoice(4,'pianoClose');return true;}
    if(this.phase==='run'&&this.benchSitRemaining<=0&&(this.profile.progress?.chalk||this.profile.achievements.includes('secondGrade'))){
      this.chalks.push({at:this.time,text:'我来过。'});this.toast('地上留下了一行粉笔字。',2);this.sound('chalk');return true;
    }return false;
  }
  useItem(id:string){
    if(this.screen!=='play'||this.phase!=='run'||this.paused||this.benchSitRemaining>0)return;
    if(this.model.useItem(id)){
      if(id==='eraser')for(const o of this.obstacles)if(o.at>=this.time&&o.at<this.time+2.5)o.erased=true;
      this.sound('item');this.toast(id==='shield'?'护盾会接住本段下一次碰撞。':id==='magnet'?'本段的碎片，向你靠近。':'前方的障碍，像粉笔字一样被擦掉。',2);
    }
  }
  update(dt:number){
    dt=clamp(dt,0,.1);this.clock+=dt;this.noticeTime=Math.max(0,this.noticeTime-dt);
    this.retryFeedbackTime=Math.max(0,this.retryFeedbackTime-dt);this.returnAnimation=Math.max(0,this.returnAnimation-dt);
    this.inputRipples=this.inputRipples.filter(r=>{r.time=Math.max(0,r.time-dt);return r.time>0;});
    if(this.paused)return;
    if(this.screen==='memory'){
      this.accumulator+=dt;
      while(this.screen==='memory'&&this.accumulator>=1/60){this.accumulator-=1/60;this.stepMemory(1/60);}
      return;
    }
    if(this.phase==='corridorTransition'){
      this.accumulator+=dt;
      while(!this.paused&&this.phase==='corridorTransition'&&this.accumulator>=1/60){this.accumulator-=1/60;this.step(1/60);}
      return;
    }
    if(this.screen!=='play')return;
    this.accumulator+=dt;
    while(this.screen==='play'&&!this.paused&&this.accumulator>=1/60){
      this.accumulator-=1/60;this.step(1/60);
    }
  }
  step(dt:number){
    if(this.phase==='ending'){
      if(this.endingMediaStatus==='pending'||this.endingMediaStatus==='loading')return;
      if(this.endingMediaStatus==='playing'){
        if(this.endingMediaClock!==null){this.phaseTime=this.endingMediaClock;this.time=this.phaseTime;}
        return;
      }
      if(this.endingMediaStatus==='failed'){
        const frame=Math.min(ENDING_SEQUENCE_FRAMES-1,Math.floor(this.phaseTime/ENDING_MEDIA_SECONDS*ENDING_SEQUENCE_FRAMES));
        if(!this.endingFallbackFrames.has(frame)||(this.phaseTime>=ENDING_MEDIA_SECONDS&&this.endingFallbackFrames.size!==ENDING_SEQUENCE_FRAMES)){
          this.endingFallbackBlocked=true;return;
        }
        this.endingFallbackBlocked=false;
      }
      this.sceneTime+=dt;this.phaseTime+=dt;this.stepEnding(dt);return;
    }
    if(this.phase==='corridorTransition'){this.stepCorridorTransition(dt);return;}
    this.sceneTime+=dt;this.phaseTime+=dt;
    this.openingMusicDelay=Math.max(0,this.openingMusicDelay-dt);
    this.subtitles.update(dt);
    this.memoryCueTime=Math.max(0,this.memoryCueTime-dt);
    if(this.memoryCueTime===0){this.memoryCue=this.memoryQueue.shift()||'';if(this.memoryCue)this.memoryCueTime=2.4;}
    this.scoreTime=Math.max(0,this.scoreTime-dt);
    this.jumpBuffer=Math.max(0,this.jumpBuffer-dt);this.downBuffer=Math.max(0,this.downBuffer-dt);this.coyoteTime=Math.max(0,this.coyoteTime-dt);
    if(this.leftSurface&&this.coyoteTime===0&&this.y>0){this.jumps=Math.max(1,this.jumps);this.leftSurface=false;}
    this.particles=this.particles.filter(p=>{p.life-=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=70*dt;return p.life>0;});this.subtitleTime=Math.max(0,this.subtitleTime-dt);
    this.actionTime=Math.max(0,this.actionTime-dt);this.flash=Math.max(0,this.flash-dt*2);this.shake=Math.max(0,this.shake-dt);
    this.hurtPulse=Math.max(0,this.hurtPulse-dt);this.protectionPulse=Math.max(0,this.protectionPulse-dt);
    this.run.invincible=Math.max(0,this.run.invincible-dt);if(this.run.invincible===0)this.run.candyActive=false;
    const wasSliding=this.slide>0;
    this.slide=Math.max(0,this.slide-dt);
    if(this.slide<1e-8)this.slide=0;
    if(wasSliding&&this.slide===0&&this.y<=1)this.slideRecovery=SLIDE_RECOVERY_SECONDS;
    else this.slideRecovery=Math.max(0,this.slideRecovery-dt);
    if(this.held){
      if(this.phase==='choice'&&this.choice===4&&!this.canTouchPiano())this.hold=0;
      else this.hold+=dt;
      const heldPointer=this.pointer;
      if(this.hold>=.6&&heldPointer&&!heldPointer.consumed&&this.longPress())heldPointer.consumed=true;
    }
    if(this.phase==='intro'){
      if(this.phaseTime>=3){this.completedIntro=true;this.profile.progress.introSeen=true;this.model.save();this.beginSegment(1);this.openingMusicDelay=.7;}return;
    }
    if(this.phase==='seat'){
      if(this.phaseTime>=1.4)this.afterChoice(2,'seat'+this.seat);
      return;
    }
    if(this.phase==='finale'){
      if(this.phaseTime>=10&&!this.finaleReplayStopped){
        this.finaleReplayStopped=true;this.finaleReplayEndAt=this.phaseTime;this.hooks.replay?.(false);
      }
      this.finaleTime=this.phaseTime<10||this.finaleReplayEndAt===null?Math.min(this.phaseTime,9.999):
        10+Math.max(0,this.phaseTime-this.finaleReplayEndAt);
      if(this.finaleTime>=15)this.toHall(true);
      return;
    }
    if(this.phase==='reverse'){
      const history=[...this.run.finishedSegments].reverse();const key=history[Math.min(history.length-1,Math.floor(this.phaseTime/10*history.length))];
      const scene:any=(SEGMENTS as any[]).find(s=>String(s.id)===key)||(BRANCHES as any)[key];if(scene){this.theme=scene.theme;this.title=scene.name;}
      if(this.phaseTime>=10){this.theme='night';this.poem(5,()=>this.beginSegment(7));}return;}
    if(this.phase==='run'&&this.benchSitRemaining>0){
      this.benchSitRemaining=Math.max(0,this.benchSitRemaining-dt);
      if(this.benchSitRemaining===0){
        this.y=0;this.used.add('micro');this.event('bench',this.microText('bench'));
      }
      return;
    }
    const float=this.phase==='reward'&&this.reward==='dream'&&this.phaseTime<30;
    this.glide=Math.max(0,this.glide-dt);
    const gravity=this.glide>0?90:this.phase==='reward'&&this.reward==='heaven'?330:XIAOMAN_MOTION.gravity;
    const oldY=this.y;
    if(float){this.vy*=Math.pow(.985,dt*60);this.vy-=dt*12;this.y=clamp(this.y+this.vy*dt,0,165);
      if(this.y<=0){
        if(!this.rewardGround)for(let i=0;i<9;i++)this.used.add('reward'+i);
        this.rewardGround=true;this.y=0;this.vy=0;
      }}
    else{
      this.vy-=gravity*dt;if(this.glide>0)this.vy=Math.max(this.vy,-28);this.y+=this.vy*dt;
      if(this.phase==='choice'&&this.choice===2&&this.touchChair(oldY))return;
      if(this.y<=0){this.y=0;this.vy=0;this.jumps=0;
        if(this.diving){this.landDive();this.diving=false;}
        this.coyoteTime=this.coyoteSeconds;this.leftSurface=false;
        if(this.jumpBuffer>0)this.jump();
      }
    }
    if(this.phase==='reward'&&this.reward==='dream'&&this.phaseTime>=30&&!this.used.has('sprint')){
      const table=this.interactionTarget(),feet=footBounds(this.y);
      const onSurface=table?.kind==='table'&&feet.x<table.x+table.width&&feet.x+feet.w>table.x;
      if(onSurface&&oldY>=65&&this.y<=65&&this.vy<=0){
        this.y=65;this.vy=0;this.jumps=0;this.coyoteTime=this.coyoteSeconds;this.used.add('onTable');this.used.add('tableLanded');this.event('tableEdge');
        if(oldY>65.5)this.traceGeometry('脚部落在课桌桌沿');
        if(this.downBuffer>0){this.downBuffer=0;this.startSprint();this.vy=-120;}
        else if(this.jumpBuffer>0)this.jump();
      }
      if(table?.kind==='table'&&table.x+table.width<feet.x&&this.used.has('tableLanded'))this.startSprint();
    }
    if(this.phase==='alleyExit'&&this.touchBranchTarget(oldY))return;
    if(this.phase==='run'){const previousTime=this.time;this.time+=dt*(this.run.items.includes('umbrella')?1.04:1);this.stepRun(dt,oldY,previousTime);return;}
    if(this.phase==='poem'){
      if(this.choice===3&&this.phaseTime>4&&this.y>18&&!this.used.has('illusion')){
        this.used.add('illusion');this.profile.progress.illusion=true;this.model.save();this.say('费力穿过课桌，出口仍是同一条走廊。',3);
      }
      if(this.phaseTime>=this.duration){const next=this.transition;this.transition=null;next?.();}return;
    }
    if(this.phase==='piano'){
      if(Math.floor(this.phaseTime*2)!==Math.floor((this.phaseTime-dt)*2)&&this.y<8)this.sound('piano');
      if(this.phaseTime>=15)this.beginChoice(4);return;
    }
    if(this.phase==='choice'){this.stepChoice(oldY);return;}
    if(this.phase==='alleyExit'){if(this.phaseTime>=this.duration){this.event('alleyReturn');this.poem(0,()=>this.beginSegment(2,22.5));}return;}
    if(this.phase==='hell'){this.stepHell();return;}
    if(this.phase==='reward'){this.stepReward(dt);return;}
  }
  stepRun(dt:number,oldY:number,previousTime:number){
    const t=this.time;
    if(this.branch==='playground'&&this.touchBranchTarget(oldY))return;
    const pose=this.playerPose(),body=this.playerBounds();
    for(const o of this.obstacles){
      if(o.done||o.erased)continue;
      advanceObstacleEvent(o,t,this.worldTravelSpeed(),dt);
      const frame=obstacleFrame(o,t),solid=frame.bounds;
      if(solid.x+solid.w<body.x){o.done=true;continue;}
      if(!frame.collidable)continue;
      if(overlaps(body,solid)){o.done=true;
        this.traceGeometry(o.label+' · '+pose+' · t='+t.toFixed(2)+' · y='+this.y.toFixed(1));
        if(this.run.candyActive&&this.run.invincible>0)this.collectStoryFragment(this.run.segment+':candy:'+o.at,1);
        else this.damage();
        if(this.phase!=='run'||this.time<t)return;
      }
    }
    for(const p of this.pickups){
      if(this.run.collected.includes(p.id))continue;
      const dx=(p.at-t)*this.runSpeed,dy=p.height-(this.y+19);
      if((Math.abs(dx)<14&&Math.abs(dy)<24)||(this.run.magnet&&Math.abs(dx)<65&&Math.abs(dy)<95)){
        if(this.collectStoryFragment(p.id,p.value)){
          this.sound('fragment');this.burst(96,this.ground()-p.height,'#e6c76f',4);
        }
      }
    }
    const once=(key:string,at:number,fn:()=>void)=>{if(t>=at&&at>=this.startAt&&!this.used.has(key)){this.used.add(key);fn();}};
    if(this.level.lifeAt!==null&&this.level.lifeAt!==undefined)once('life',this.duration*this.level.lifeAt,()=>{if(this.y<42){this.model.collectLife(this.run.segment+':life');this.sound('life');}});
    const micro=this.level.micro;
    if(micro&&!this.used.has('micro')){
      const at=typeof micro.at==='number'&&micro.at<=1?this.duration*micro.at:micro.at;
      const center=worldX(at,t),feet=footBounds(this.y),oldFeet=footBounds(oldY);
      // The marker beneath each prop is its contact surface. This small area
      // gives a slide or descending dive time to touch it without a timed snap.
      const contact={x:center-12,y:GROUND_Y-5,w:24,h:6};
      const footSweep=this.y<oldY?{
        x:feet.x,y:oldFeet.y,w:feet.w,h:feet.y+feet.h-oldFeet.y
      }:feet;
      if(overlaps(footSweep,contact)){
        if(micro.event==='bench'){
          this.benchSitRemaining=BENCH_SIT_SECONDS;
          this.y=BENCH_SEAT_HEIGHT;this.vy=0;this.jumps=0;this.slide=0;this.slideRecovery=0;this.diving=false;
          this.cancelInput();this.sound('land');
        }else{
          this.used.add('micro');this.event(micro.event,this.microText(micro.event));
        }
      }else if(contact.x+contact.w<feet.x){
        this.used.add('micro');
      }
    }
    if(!this.branch){
      if(this.segment===2)once('pen',this.duration*.3,()=>{if(this.y<18)this.event('pen','把笔收进口袋。');});
      if(this.segment===3){
        once('plane',this.duration*.4,()=>{if(this.y>20&&this.y<85)this.event('plane','一架纸飞机，停在掌心。');});
        once('homework',this.duration*.7,()=>this.event(this.y<12?'copyHomework':'ownHomework',this.y<12?'字迹照着别人的，一笔一笔。':'绕过摊开的作业本，认真写完自己的。'));
      }
      if(this.segment===4){
        once('speak',this.duration*.5,()=>this.event(this.y<12?'speak':'silent',this.y<12?'卡在喉咙里的话，终于说出去了。':'话咽下去，走廊仍然很长。'));
        once('eraser',this.duration*.65,()=>{if(this.y<18)this.event('eraser','橡皮擦得掉字，擦不掉那句话。');});
      }
      if(this.segment===5){
        once('compare1',this.duration*.3,()=>{
          if(this.sceneLinesShown.has('compare1'))this.model.event('compared');
          else {this.sceneLinesShown.add('compare1');this.event('compared');}
        });
        once('compare2',this.duration*.7,()=>{
          this.event('comparedAgain');
          if(!this.sceneLinesShown.has('compare2')){this.sceneLinesShown.add('compare2');this.say('「他又是第一。」',4);}
        });
      }
      once('symbol',this.duration*.82,()=>{
        if(this.segment<7&&this.y>10){this.event('symbol'+this.segment);this.used.add('symbolBroken');this.lastAction='break';this.actionTime=.4;this.sound('break');this.burst(110,120,'#eadcb3',10);}
      });
    }else if(this.branch==='playground'){
      once('graffiti',this.duration*.46,()=>{if(this.y<12&&this.run.items.includes('pen'))this.event('graffiti','围墙上多了一行无人署名的字。');});
    }
    for(const beat of storyBeatsBetween((this.branch||String(this.segment)) as ChapterSceneKey,previousTime,t,this.run.events)){
      const key='story:'+beat.id;
      if(!this.used.has(key)){
        this.used.add(key);
        if(this.sceneLinesShown.has(key))continue;
        this.sceneLinesShown.add(key);
        // A timed line must remain tied to its visible object, while a choice
        // response keeps precedence and may cause the older line to expire.
        this.subtitles.show(beat.text,{lane:'story',source:'narrator',priority:1,
          seconds:4.4,maxQueueDelay:1.2,interruptSamePriority:true});
      }
    }
    if(this.run.wet>0&&(this.theme==='dawn'||this.theme==='dusk'||this.theme==='noon'))this.run.wet=Math.max(0,this.run.wet-dt);
    if(t>=this.duration)this.finishSegment();
  }
  microText(id:string){return ({hat:'他把帽子按在头上，跑远了。',bag:'书包自己站好了，像没人碰过。',paper:'纸保住了。他没说谢谢，但你听见了。',plant:'土撒了一点，花站直了。',bench:'谁也没说话。这样就挺好。',milk:'牛奶是温的。写完最后一题刚好。',wish:'牌子上写什么都没看。你只摸了一下。'} as any)[id]||'';}
  stepChoice(oldY:number){
    const n=this.choice;
    if(n===1){
      const wall=choicePropBounds('wall',this.phaseTime),umbrella=choicePropBounds('umbrella',this.phaseTime);
      const feet=footBounds(this.y),oldFeet=footBounds(oldY);
      const footSweep={x:feet.x,y:oldFeet.y,w:feet.w,h:feet.y+feet.h-oldFeet.y};
      const wallTop={x:wall.x,y:wall.y-2,w:wall.w,h:4};
      if(this.vy<=0&&this.y<=oldY&&overlaps(footSweep,wallTop)){this.afterChoice(1,'alley');return;}
      if(overlaps(feet,umbrella)){this.afterChoice(1,'umbrella');return;}
    }
    if(n===3){
      const exam=choicePropBounds('exam',this.phaseTime),feet=footBounds(this.y);
      if(overlaps(feet,exam)){this.afterChoice(3,this.run.items.includes('pen')?'cheat':'noPen');return;}
      if(exam.x+exam.w<feet.x){this.afterChoice(3,'faceExam');return;}
    }
    if(n===5){
      const bench=choicePropBounds('bench',this.phaseTime),door=choicePropBounds('door',this.phaseTime);
      const body=this.playerBounds();
      // The seat occupies the first five pixels of its bounds; a slide counts only
      // once the shared animated collision body actually fits underneath it.
      if(this.slide>0&&this.y<=1&&body.y>=bench.y+5&&
         body.x<bench.x+bench.w&&body.x+body.w>bench.x){
        this.afterChoice(5,'apologize');return;
      }
      if(body.x<door.x+door.w&&body.x+body.w>door.x){this.afterChoice(5,'slamDoor');return;}
    }
    if(this.phaseTime<this.duration)return;
    if(n===1)this.afterChoice(1,'umbrella');
    if(n===2){this.toast('三把凳面都错过了。铃声把你带向操场。',3);this.afterChoice(2,'skipClass');}
    if(n===3)this.afterChoice(3,'faceExam');
    if(n===4)this.afterChoice(4,'pianoPractice');
    if(n===5)this.afterChoice(5,'slamDoor');
    if(n===6)this.afterChoice(6,'forward');
  }
  landDive(){
    this.sound('land');this.burst(96,this.ground(),'#c8b99f',5);
    if(this.phase==='choice'&&this.choice===4&&overlaps(footBounds(0),choicePropBounds('piano',this.phaseTime)))
      this.afterChoice(4,'pianoSmash');
  }
  playerPose():PlayerPose {
    if(this.benchSitRemaining>0)return 'run';
    return (this.slide>0||this.slideRecovery>0)&&this.y<=1?'slide':this.diving&&this.y>1?'dive':this.y>1?'jump':'run';
  }
  worldTravelSpeed(){return RUN_SPEED*(this.phase==='run'&&this.run.items.includes('umbrella')?1.04:1);}
  /** Keep collision posture in step with the shared entrance and recovery animation. */
  playerBounds(){
    const b=playerBodyBounds(this.y,this.playerPose());
    if(this.y>1)return b;
    let height=b.h;
    const standing=XIAOMAN_MOTION.standingCollisionHeight,low=XIAOMAN_MOTION.slidingCollisionHeight;
    if(this.slide>0){
      const blend=clamp((XIAOMAN_MOTION.slideSeconds-this.slide)/XIAOMAN_MOTION.slideEntrySeconds,0,1);
      height=standing+(low-standing)*blend;
    }else if(this.slideRecovery>0){
      const rising=SLIDE_RECOVERY_SECONDS-XIAOMAN_MOTION.slideRecoveryLowSeconds;
      const blend=clamp((rising-this.slideRecovery)/rising,0,1);height=low+(standing-low)*blend;
    }
    // The torso remains narrow while crouching; shoes and reaching hands are decorative.
    // Expand only once the shoulders actually occupy the horizontal low posture.
    const width=height>23?14:b.w;
    return {...b,x:96-width/2,y:GROUND_Y-this.y-height,w:width,h:height};
  }
  private touchChair(oldY:number):boolean {
    if(this.vy>0||oldY<CHAIR_HEIGHT||this.y>CHAIR_HEIGHT)return false;
    const feet=footBounds(this.y);
    const sweep={x:feet.x,y:GROUND_Y-oldY-2,w:feet.w,h:oldY-this.y+3};
    for(let i=0;i<CHAIRS.length;i++){
      const surface=chairSurface(i,this.phaseTime);
      if(!surface.active||!overlaps(sweep,surface.rect))continue;
      this.y=CHAIR_HEIGHT;this.vy=0;this.jumps=0;this.coyoteTime=this.coyoteSeconds;
      if(!this.diving)return false;
      this.diving=false;this.seat=surface.index;this.chairFreezeTime=this.phaseTime;
      this.phase='seat';this.phaseTime=0;this.duration=1.4;this.title='教室 · 落座';
      this.sound('land');this.traceGeometry('脚部急坠落在'+surface.label+'凳面');
      this.event('seat'+this.seat,['有人把书包往里挪了挪。','旁边的孩子轻轻点了点头。','窗边的孩子抬头，给你让出一点地方。'][this.seat-1]);
      return true;
    }
    return false;
  }
  stepHell(){
    const t=this.phaseTime;
    if(t>=8&&!this.used.has('hellActTwo')){
      this.used.add('hellActTwo');this.say('灰里有熟悉的脚步声。你还记得有人等你回去。',5);
    }
    if(t>=20&&!this.used.has('hellActThree')){
      this.used.add('hellActThree');this.say('那盏灯近了。再越过最后几道影子。',5);
    }
    const body=this.playerBounds();
    for(let i=0;i<this.hellObstacles.length;i++){
      const o=this.hellObstacles[i],key='hell'+i;if(o.done)continue;
      const solid=obstacleFrame(o,t).bounds;
      if(solid.x+solid.w<body.x){o.done=true;this.used.add(key);continue;}
      if(overlaps(body,solid)){o.done=true;this.model.hellResult(false);this.restart();return;}
    }
    if(t>=28){
      this.model.hellResult(true);const s=this.returnScene;this.phase=s.phase;this.time=s.time;this.phaseTime=s.phaseTime;
      this.theme=s.theme;this.title=s.title;this.cancelInput();this.resetMovement();this.clearStoryDisplay();
      this.showHeading(this.title,3);this.say('你穿过了余烬。光，还在。',4);this.sound('life');
      this.used=new Set(s.used);
    }
  }
  stepReward(dt:number){
    const t=this.phaseTime;
    if(this.reward==='dream'&&t>=30&&!this.used.has('act2')){
      this.used.add('act2');if(!this.rewardGround)this.event('dreamNoGround');this.y=100;this.vy=-20;this.title='变小的一天';this.say('桌沿就在脚下。滑下去，让自己变得很轻。',5);
    }
    const rewardTime=this.rewardClock();
    const count=18;
    for(let i=0;i<count;i++){
      const at=3+i*3;const key='reward'+i;
      if(rewardTime>=at&&!this.used.has(key)){
        this.used.add(key);const h=this.reward==='dream'&&t<30?40+(i%3)*40:18+(i%3)*27;
        const hit=Math.abs(this.y+18-h)<38||this.used.has('sprint');
        if(hit){this.model.collectWrapper(key);this.rewardHits++;this.chain++;this.sound('candy');this.burst(100,this.ground()-h,'#fff2b7',5);}
        else this.chain=0;
        if(this.reward==='heaven'&&this.chain>=12)this.event('heavenChain12');
      }
    }
    if(t>=60){this.event(this.reward==='dream'?'dreamReward':'heavenReward');this.beginChoice(6);}
  }
  rewardClock(){return this.reward==='dream'&&this.phaseTime>=30&&this.used.has('sprint')?
    this.phaseTime+(this.phaseTime-this.rewardSprintAt)*.5:this.phaseTime;}
  startSprint(){if(this.used.has('sprint'))return;this.rewardSprintAt=this.phaseTime;if(this.used.has('onTable'))this.leftSurface=true;this.used.add('sprint');this.used.delete('onTable');this.sound('jump');this.say('桌子忽然很大，而你轻得像一阵风。',3);}
  /** World geometry shared with the renderer. Height is measured above the running ground. */
  interactionTarget():InteractionTarget|null {
    if(this.phase==='alleyExit')return {kind:'wall',x:worldX(6,this.phaseTime)-28,width:36,height:93,active:this.phaseTime<=this.duration};
    if(this.phase==='run'&&this.branch==='playground')return {kind:'side',x:worldX(PLAYGROUND_SIDE_DOOR_AT,this.time),width:63,height:25,active:true};
    if(this.phase==='reward'&&this.reward==='dream'&&this.phaseTime>=30&&!this.used.has('sprint'))return {kind:'table',x:260-(this.phaseTime-30)*RUN_SPEED-310,width:310,height:65,active:true};
    return null;
  }
  private touchBranchTarget(oldY:number):boolean {
    const target=this.interactionTarget();if(!target||target.kind==='table')return false;
    const feet=footBounds(this.y),horizontal=target.active&&feet.x<target.x+target.width&&feet.x+feet.w>target.x;
    if(!horizontal)return false;
    if(target.kind==='wall'&&oldY>=target.height&&this.y<=target.height&&this.vy<=0){
      this.y=target.height;this.vy=0;this.traceGeometry('脚部落在巷口窗台');
      this.startEnding('wall');return true;
    }
    // Crossing the raised threshold while still beside the door is the entry.
    // A jump started away from it cannot turn into a delayed side return.
    const thresholdCrossed=oldY<target.height&&this.y>=target.height||
      oldY>target.height&&this.y<=target.height;
    if(target.kind==='side'&&thresholdCrossed){
      this.event('sideReturn');this.model.finishSegment(this.level.fragments);this.poem(2,()=>this.beginSegment(4));return true;
    }
    return false;
  }
  ground(){return GROUND_Y;}
  traceGeometry(message:string){
    if(!this.debugGeometry)return;
    const line=this.phase+' '+this.phaseTime.toFixed(2)+'s · '+message;
    this.geometryEvents.push(line);if(this.geometryEvents.length>12)this.geometryEvents.shift();
    if(typeof console!=='undefined')console.debug('[geometry]',line);
  }
  burst(x:number,y:number,color:string,n:number){for(let i=0;i<n;i++)this.particles.push({x,y,vx:Math.cos(i*2.4)*20,vy:-20-i*3,life:.7,color});}
  render(p:Painter){this.buttons=[];drawGame(this,p);}
  button(x:number,y:number,w:number,h:number,label:string,action:()=>void,disabled=false,immediate?:boolean){
    // Existing item renderers keep their press-to-use behavior; other UI confirms on release.
    const item=this.screen==='play'&&this.phase==='run'&&!this.paused&&!this.panel&&/^[盾磁擦]\s/.test(label);
    this.buttons.push({x,y,w,h,label,action,disabled,immediate:immediate??item});
  }
  private uiContext(){return [this.screen,this.phase,this.panel,this.panelPage,this.paused].join('|');}
  private contains(b:Button,x:number,y:number){return x>=b.x&&x<=b.x+b.w&&y>=b.y&&y<=b.y+b.h;}
  private ripple(x:number,y:number,kind:InputRipple['kind']='deadZone'){
    this.inputRipples.push({x,y,time:.35,duration:.35,kind});if(this.inputRipples.length>8)this.inputRipples.shift();
  }
  pointerDown(x:number,y:number){
    this.held=false;this.hold=0;
    const b=[...this.buttons].reverse().find(b=>this.contains(b,x,y));
    if(b){
      this.pointer={x,y,ui:true,consumed:true,button:b,context:this.uiContext(),inside:true,cancelled:false};
      if(b.immediate&&!b.disabled){b.action();this.sound('ui');}return;
    }
    this.pointer=null;
    if(this.endingMediaActive||this.phase==='ending'||this.phase==='corridorTransition')return;
    if(this.screen==='memory'&&!this.paused&&!this.panel){
      this.pointer={x,y,lastX:x,lastY:y,consumed:false,ui:false};
      const memory=this.memoryReplay;
      this.held=memory?.stage==='choice'&&memory.segment===4&&
        x>=MEMORY_PIANO_LID.x&&x<=MEMORY_PIANO_LID.x+MEMORY_PIANO_LID.w&&
        y>=MEMORY_PIANO_LID.y&&y<=MEMORY_PIANO_LID.y+MEMORY_PIANO_LID.h;
      return;
    }
    if(this.screen!=='play'||this.paused||this.panel)return;
    this.pointer={x,y,lastX:x,lastY:y,consumed:false,ui:false};this.held=true;
  }
  pointerMove(x:number,y:number){
    const pt=this.pointer;if(!pt)return;
    if(pt.ui){pt.inside=this.contains(pt.button,x,y);if(!pt.inside)pt.cancelled=true;return;}
    if(this.endingMediaActive||this.phase==='ending'||this.phase==='corridorTransition')return;
    if(pt.consumed)return;
    const dx=x-pt.x,dy=y-pt.y;pt.lastX=x;pt.lastY=y;
    if(this.screen==='memory'){
      if(dx < -24&&Math.abs(dx)>Math.abs(dy)){
        const allowed=this.memoryReplay?.stage==='choice'&&this.memoryReplay.segment===6&&this.model.allLit();
        this.left();if(!allowed)this.ripple(x,y,'blocked');pt.consumed=true;this.held=false;
      }else if(Math.abs(dx)>24||Math.abs(dy)>24){pt.consumed=true;this.held=false;this.ripple(x,y);}
      return;
    }
    if(dy>16&&Math.abs(dy)>Math.abs(dx)){this.down();pt.consumed=true;this.held=false;}
    else if(dx < -24&&Math.abs(dx)>Math.abs(dy)){
      const allowed=this.canLookBack();this.left();
      if(!allowed)this.ripple(x,y,'blocked');pt.consumed=true;this.held=false;
    }
    else if(Math.abs(dx)>24||Math.abs(dy)>24){pt.consumed=true;this.held=false;this.ripple(x,y);}
  }
  pointerUp(x:number,y:number){
    const pt=this.pointer,heldFor=this.hold;
    this.pointer=null;this.held=false;this.hold=0;
    if(!pt)return;
    if(pt.ui){
      const b:Button=pt.button;
      const current=this.buttons.find(candidate=>candidate.label===b.label&&candidate.x===b.x&&candidate.y===b.y&&candidate.w===b.w&&candidate.h===b.h);
      if(!b.immediate&&!b.disabled&&!pt.cancelled&&this.contains(b,x,y)&&pt.context===this.uiContext()&&current&&!current.disabled){current.action();this.sound('ui');}
      return;
    }
    if(this.endingMediaActive||this.phase==='ending'||this.phase==='corridorTransition')return;
    if(this.screen==='memory')return;
    if(!pt.consumed){const distance=Math.hypot(x-pt.x,y-pt.y);if(distance<4&&heldFor<.6)this.jump();else if(heldFor<.6)this.ripple(x,y);}
  }
  pointerCancel(){this.pointer=null;this.held=false;this.hold=0;this.jumpBuffer=0;this.downBuffer=0;}
  setEndingMediaActive(active:boolean){
    if(this.endingMediaActive===active)return;
    this.endingMediaActive=active;
    if(active){this.cancelInput();this.resetMovement();}
  }
  /** Newly constructed scenes start without a jump, dive or glide from their predecessor. */
  private resetMovement(height=0){
    this.y=height;this.vy=0;this.jumps=0;this.slide=0;this.slideRecovery=0;this.glide=0;this.diving=false;
  }
  cancelInput(){this.pointerCancel();this.keyHeld.clear();this.coyoteTime=0;this.leftSurface=false;}
  appHide(){
    this.cancelInput();this.accumulator=0;
    if(this.screen==='memory'){this.returnFromMemoryReplay();return;}
    if(this.screen==='play')this.paused=true;
  }
  appShow(){this.cancelInput();this.accumulator=0;}
  back(){
    this.cancelInput();
    if(this.screen==='memory'){this.returnFromMemoryReplay();return;}
    if(this.exitConfirm){
      this.exitConfirm=false;
      this.paused=this.screen==='play';
      return;
    }
    if(this.panel){this.panel='';return;}
    if(this.phase==='corridorTransition'){this.paused=!this.paused;return;}
    if(this.screen!=='play')return;
    if(this.paused){this.toHall();return;}
    this.paused=true;
  }
  keyDown(key:string){
    if(this.keyHeld.has(key))return;this.keyHeld.add(key);
    if(key==='F3')return;
    if(['Escape','Backspace','BrowserBack','GoBack'].includes(key)){this.back();this.keyHeld.add(key);return;}
    if(this.endingMediaActive)return;
    if(this.phase==='corridorTransition')return;
    if(this.screen==='hall'){if(!this.panel&&key==='Enter')this.start();return;}
    if(this.screen==='memory'){
      if(this.paused)return;
      const memory=this.memoryReplay;
      if(memory?.stage==='object'&&(key==='Enter'||key===' '))this.touchMemoryObject();
      else if(memory?.stage==='choice'){
        if(key==='ArrowLeft'||key.toLowerCase()==='a')this.left();
        else if(memory.segment===4&&key.toLowerCase()==='e'){
          this.pointer={consumed:false,ui:false,source:'key'};this.held=true;this.hold=0;
        }else if(/^[1-4]$/.test(key))this.chooseMemoryReplay(this.memoryVisibleChoiceIds()[Number(key)-1]||'');
      }
      return;
    }
    if(this.paused||this.panel)return;
    if(key===' '||key==='ArrowUp'||key.toLowerCase()==='w')this.jump();
    if(key==='ArrowDown'||key.toLowerCase()==='s')this.down();
    if(key==='ArrowLeft'||key.toLowerCase()==='a')this.left();
    if(key.toLowerCase()==='e'){this.pointer={consumed:false,ui:false,source:'key'};this.held=true;this.hold=0;}
    if(key==='1')this.useItem('shield');if(key==='2')this.useItem('magnet');if(key==='3')this.useItem('eraser');
  }
  keyUp(key:string){this.keyHeld.delete(key);if(this.endingMediaActive||this.phase==='corridorTransition')return;if(key.toLowerCase()==='e'&&this.pointer?.source==='key')this.pointerCancel();}
}
