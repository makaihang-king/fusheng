export interface EndingVideoState {
  visible: boolean;
  seconds: number;
  status: 'loading' | 'playing' | 'ended' | 'failed';
}
/** Shared left/top-origin drawing interface. Text y is the top edge. */
export interface Painter {
  rect(x:number,y:number,w:number,h:number,color:string):void;
  line(x1:number,y1:number,x2:number,y2:number,color:string,width?:number):void;
  circle(x:number,y:number,r:number,color:string):void;
  text(value:string,x:number,y:number,size:number,color:string,align?:'left'|'center'|'right'):void;
  poly(points:number[][],color:string):void;
  /** Returns false while missing/loading, so callers draw their procedural fallback. */
  image(key:string,x:number,y:number,w:number,h:number,opacity?:number):boolean;
  /** Crop a top-left normalized source region, preserving the source material's pixel density. */
  imageRegion?(key:string,sx:number,sy:number,sw:number,sh:number,x:number,y:number,w:number,h:number,opacity?:number):boolean;
  /** The media clock gates first-run completion; a boolean is kept for headless painters. */
  video?(key:string,x:number,y:number,w:number,h:number,elapsedSeconds:number,paused?:boolean,sessionId?:number,skin?:string,muted?:boolean):boolean|EndingVideoState;
}
