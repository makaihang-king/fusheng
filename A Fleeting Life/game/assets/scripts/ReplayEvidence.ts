/** Evidence that one video started at the beginning and really advanced to its expected end. */
export class VideoReplayEvidence {
  private playing=false;
  private paused=false;
  private invalid=false;
  private endedByNativeReset=false;
  private first:number|null=null;
  private lastMedia=0;
  private furthest=0;
  private activeMs=0;
  private lastWallMs:number|null=null;
  private firstActiveMs=0;
  private lastAdvanceActiveMs=0;
  private advances=0;
  constructor(private readonly expectedSeconds:number,private readonly nativeReset=false){}
  private tick(nowMs:number){
    if(!Number.isFinite(nowMs)||this.lastWallMs!==null&&nowMs<this.lastWallMs){this.invalid=true;return false;}
    if(this.lastWallMs!==null&&!this.paused)this.activeMs+=nowMs-this.lastWallMs;
    this.lastWallMs=nowMs;return true;
  }
  onPlaying(nowMs:number){if(this.tick(nowMs))this.playing=true;}
  pause(nowMs:number){if(this.paused)return;this.tick(nowMs);this.paused=true;}
  resume(nowMs:number){
    if(!Number.isFinite(nowMs)||this.lastWallMs!==null&&nowMs<this.lastWallMs){this.invalid=true;return;}
    this.lastWallMs=nowMs;this.paused=false;
  }
  observe(currentTime:number,nowMs:number){
    if(!this.tick(nowMs)||!this.playing||this.paused||this.invalid||!Number.isFinite(currentTime)||currentTime<0)return;
    // A previous resource can briefly report its old position after a URL switch.
    if(this.first===null){
      if(currentTime>Math.min(1,this.expectedSeconds*.4))return;
      this.first=this.lastMedia=this.furthest=currentTime;
      this.firstActiveMs=this.lastAdvanceActiveMs=this.activeMs;
      return;
    }
    // Some players reset currentTime to zero before sending their final event.
    if(currentTime<this.lastMedia-.15){
      // Android's CocosVideoView seeks to 1 ms immediately after MediaPlayer completes.
      // The JS completion event may never arrive, so require substantial real playback
      // before treating that reset as an end signal.
      if(this.nativeReset&&!this.invalid&&currentTime<=.05&&this.advances>=3&&
        this.furthest>=this.expectedSeconds-.3&&
        this.activeMs-this.firstActiveMs>=Math.max(150,(this.expectedSeconds-this.first)*850)){
        this.endedByNativeReset=true;this.lastMedia=currentTime;this.playing=false;return;
      }
      if(!this.completed)this.invalid=true;return;
    }
    const advance=currentTime-this.lastMedia;
    if(advance<.02)return;
    const wallSeconds=(this.activeMs-this.lastAdvanceActiveMs)/1000;
    // A stale position or seek cannot make several seconds of video pass in one frame.
    if(advance>wallSeconds*1.6+.35){this.invalid=true;return;}
    this.lastMedia=currentTime;this.furthest=currentTime;
    this.lastAdvanceActiveMs=this.activeMs;this.advances++;
  }
  get completed(){
    if(this.first===null||this.invalid||this.advances<3)return false;
    if(this.endedByNativeReset)return true;
    // The native MP4 index includes roughly one final frame beyond the last
    // presentation timestamp. Allow that frame, not a tenth of the clip.
    const endTolerance=Math.min(.12,Math.max(.03,this.expectedSeconds*.04));
    const minimumEnd=Math.max(.18,this.expectedSeconds-endTolerance);
    const minimumTravel=Math.max(.12,Math.min(.35,this.expectedSeconds*.3));
    return this.furthest>=minimumEnd&&this.furthest-this.first>=minimumTravel&&
      this.activeMs-this.firstActiveMs>=Math.max(150,(minimumEnd-this.first)*750);
  }
  snapshot(){return {expectedSeconds:this.expectedSeconds,first:this.first,furthest:this.furthest,
    advances:this.advances,activeMs:this.activeMs,invalid:this.invalid,
    endedByNativeReset:this.endedByNativeReset,completed:this.completed};}
}
