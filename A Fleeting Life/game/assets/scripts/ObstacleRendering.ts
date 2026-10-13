import type { Painter } from './Painter';
import { GROUND_Y } from './Geometry';
import { obstacleFrame, type WorldObstacle } from './ObstacleLogic';

/** The new Qwen parts use the existing physical layout; artwork never defines hitboxes. */
export function obstacleArtwork(o:WorldObstacle):{id:string;box:[number,number,number,number];face?:string}|null{
  const f=obstacleFrame(o,0),kind=o.kind,label=o.label;
  const face=kind!=='high'?undefined:f.source==='bench'?'face.wood':f.source==='lamp'?'face.lamp':
    f.source==='awning'?'face.canvas':f.source==='rubble'?'face.burnt':
    /跳绳/.test(label)?'face.rope':/抹布/.test(label)?'face.canvas':/茶盘|茶水|茶杯/.test(label)?'face.tray':
    /体操垫/.test(label)?'face.pad':/书架|滑梯/.test(label)?'face.wood':'face.metal';
  const pick=(id:string,box:[number,number,number,number])=>({id,box,face});
  if(f.source==='vehicle'||f.source==='cabinet'||f.source==='banner')return null;
  if(f.source==='ball')return pick(/足球/.test(label)?'football':'ball',[-12,195,24,21]);
  if(f.source==='bicycle')return pick('bicycle',[-12,193,24,23]);
  if(f.source==='satchel')return pick('satchel',[-16,193,32,23]);
  if(f.source==='step')return /讲台/.test(label)?pick('step.dais',[-32,185,64,31]):pick('step',[-32,125,64,91]);
  if(f.source==='bucket')return /扫帚|簸箕/.test(label)?pick('bucket.broom',[-14,191,28,25]):pick('bucket.mop',[-14,163,28,53]);
  if(f.source==='books'){
    if(/软垫/.test(label))return pick('cushions',[-14,164,28,52]);
    if(kind==='tall')return pick('books.tall',[-14,164,28,52]);
    return pick(/摊开/.test(label)?'books.open':'books.low',[-12,197,24,19]);
  }
  if(f.source==='crate'){
    if(/课桌/.test(label))return pick('crate.folded',[-14,164,28,52]);
    if(/砖/.test(label))return pick('brick',[-12,197,24,19]);
    if(/纸箱/.test(label)&&kind==='tall')return pick('crate.paper',[-14,164,28,52]);
    return kind==='tall'?pick('crate.tall',[-14,164,28,52]):pick('crate.low',[-12,197,24,19]);
  }
  if(f.source==='bench')return kind==='low'?pick('bench.low',[-14,195,28,21]):pick('bench.high',[-27,179,54,37]);
  if(f.source==='lamp')return pick('lamp',[-16,131,50,85]);
  if(f.source==='awning')return pick('awning',[-24,106,54,110]);
  if(f.source==='rubble')return kind==='high'?pick('rubble.high',[-16,112,49,104]):pick('rubble.low',[-12,197,24,19]);
  if(/跨栏/.test(label))return pick('rack.hurdle',[-18,195,36,21]);
  if(/跳绳/.test(label))return pick('rack.rope',[-29,140,58,76]);
  if(/书架/.test(label))return pick('rack.shelving',[-28,146,56,70]);
  if(/滑梯/.test(label))return pick('rack.slide',[-29,140,66,76]);
  if(/抹布/.test(label))return pick('rack.cloth',[-29,140,58,76]);
  if(/茶盘|茶水|茶杯/.test(label))return pick('rack.tray',[-29,140,58,76]);
  if(/体操垫/.test(label))return pick('rack.mat',[-29,140,58,76]);
  return pick('rack',[-29,140,58,76]);
}

function drawQwenObstacle(p:Painter,o:WorldObstacle,time:number){
  const f=obstacleFrame(o,time),b=f.bounds,x=f.x;
  const image=(id:string,xx:number,yy:number,w:number,h:number)=>p.image('props.obstacles.v2.'+id,xx,yy,w,h);
  const shadow=(w:number)=>p.poly([[x-w/2,215],[x+w/2,215],[x+w/2+4,218],[x-w/2-4,218]],'rgba(45,48,39,0.16)');
  if(f.source==='vehicle'){
    // Put the authored driver's door over the encounter, not the front wheel.
    // In the body sprite it occupies x-14..x+5 after this 19 px shift.
    if(!image('vehicle.body',x-53,154,94,62))return false;
    shadow(78);
    if(f.progress>0){
      const closedLeft=x-14,hinge=x+5,leafLeft=closedLeft+6*f.progress,drop=11*f.progress;
      const reveal=Math.min(1,f.progress*3);
      p.rect(closedLeft,b.y,hinge-closedLeft,41,`rgba(52,70,61,${reveal})`);
      p.line(closedLeft+1,b.y+17,hinge-1,b.y+17,`rgba(119,139,122,${reveal})`,1);
      p.line(closedLeft+2,b.y+39,hinge-1,b.y+39,`rgba(135,150,125,${reveal})`,2);
      // Keep the original driver's silhouette visible inside the exposed cabin.
      p.imageRegion?.('props.obstacles.v2.vehicle.body',41/94,16/62,12/94,18/62,x-12,170,12,18);
      p.poly([[leafLeft,215],[hinge,205],[hinge+5,219],[leafLeft-8,221]],`rgba(31,39,32,${.2*reveal})`);
      // The front edge stays on the real body seam. The free edge moves toward
      // the camera and down to the road; narrow source strips make a hinged
      // parallelogram instead of stretching a flat rectangle across the wheel.
      const strips=12,width=hinge-leafLeft;
      if(p.imageRegion){
        for(let i=0;i<strips;i++){
          const u=i/strips,xx=leafLeft+width*u,yy=b.y+drop*(1-u);
          if(!p.imageRegion('props.obstacles.v2.vehicle.door',(strips-i-1)/strips,0,1/strips,1,
            xx,yy,width/strips+.15,41,reveal))return false;
        }
      }else if(!image('vehicle.door',leafLeft,b.y+drop,width,41))return false;
      p.line(hinge,b.y,hinge,205,`rgba(60,81,70,${reveal})`,1);
      p.line(leafLeft,b.y+drop,leafLeft,205+drop,`rgba(176,195,171,${reveal})`,2);
      p.line(leafLeft,205+drop,hinge,205,`rgba(53,79,67,${reveal})`,2);
    }
    if(o.cueSeen&&f.progress<1)p.rect(x+34,186,4,3,'#ddba75');
    return true;
  }
  if(f.source==='cabinet'){
    // Remove the former unused upper compartment without stretching the working
    // book compartment. The same-source cornice finishes a normal 66 px cabinet.
    const body=p.imageRegion?.('props.obstacles.v2.cabinet.body',0,.37,1,.63,x-48,153,36,63)
      ??image('cabinet.body',x-48,153,36,63);
    if(!body)return false;
    p.imageRegion?.('props.obstacles.v2.cabinet.body',0,0,1,.06,x-49,150,38,6);
    shadow(36);
    // The upper door starts closed on the left of its hinge; the exposed book
    // compartment and the moving leaf share the original 156..193 vertical span.
    const closed=24*(1-f.progress);
    if(closed>.05&&!image('cabinet.door',b.x-closed,b.y,closed,b.h))return false;
    if(f.progress>0){
      p.line(b.x,b.y,b.x,b.y+b.h,'#6c5d43',1);
      if(!image('cabinet.door',b.x,b.y,b.w*f.progress,b.h))return false;
    }
    return true;
  }
  if(f.source==='banner'){
    if(!image('banner.frame',x-29,140,58,76))return false;
    shadow(56);
    const top=f.motion==='lowerBanner'?b.y-43*(1-f.progress):b.y;
    p.line(x-20,147,b.x,top,'#8a7b5f',1);p.line(x+20,147,b.x+b.w,top,'#8a7b5f',1);
    if(!image('banner.cloth',b.x,top,b.w,b.h))return false;
    if(f.motion==='lowerBanner'&&f.progress>0)p.line(x+20,147,x+26,158,'#8a7b5f',1);
    return true;
  }
  if(f.source==='step'&&!/讲台/.test(o.label)){
    // The entry belongs to a shallow facade at the rear curb (205). The stone
    // risers project into the actual walking plane and retain 197..216 bounds.
    if(!image('step.wall',x-43,137,18,68)||!image('step.wall',x+25,137,18,68))return false;
    p.imageRegion?.('props.obstacles.v2.step.wall',0,0,1,.1,x-43,135,86,6);
    if(!(p.imageRegion?.('props.obstacles.v2.step',0,0,1,.79,x-26,137,52,68)
      ??image('step',x-26,137,52,68)))return false;
    if(!image('face.stone',b.x,b.y,b.w,b.h))return false;
    shadow(38);return true;
  }
  const art=obstacleArtwork(o);
  if(!art)return false;
  const [left,top,w,h]=art.box;
  if(!image(art.id,x+left,top,w,h))return false;
  if(art.face){
    const key='props.obstacles.v2.'+art.face;
    if(f.source==='lamp')p.line(x-6,173,x,b.y,'#7d8971',2);
    else if(f.source==='awning'){
      p.line(x-19,154,b.x,b.y,'#998b68',1);p.line(x+21,156,b.x+b.w,b.y,'#998b68',1);
    }else if(f.source==='rubble'){
      p.imageRegion?.(key,.7,0,.3,1,b.x+b.w,b.y+1,9,b.h-2);
    }else if(art.face==='face.rope'){
      p.line(x-20,170,b.x,b.y+1,'#9a8b68',2);p.line(b.x+b.w,b.y+1,x+20,170,'#9a8b68',2);
    }else{
      p.imageRegion?.(key,0,.3,.22,.25,x-20,b.y+4,6,3);
      p.imageRegion?.(key,.78,.3,.22,.25,b.x+b.w,b.y+4,6,3);
    }
    if(!image(art.face,b.x,b.y,b.w,b.h))return false;
  }
  shadow(Math.min(64,w));return true;
}

/** Draw natural material and its source. Collision rectangles are never rendered. */
export function drawPhysicalObstacle(p:Painter,o:WorldObstacle,time:number,color:string){
  if(drawQwenObstacle(p,o,time))return;
  const f=obstacleFrame(o,time),b=f.bounds,x=f.x,y=GROUND_Y;
  const wood='#947659',edge='#5f6251',paper='#ddd1b2',metal='#637b75';
  const shadow=(width:number)=>p.poly([[x-width/2,y-1],[x+width/2,y-1],[x+width/2+6,y+2],[x-width/2-6,y+2]],'rgba(54,63,52,0.16)');
  const rearPosts=()=>{
    p.line(x-20,142,x-20,y-7,edge,3);p.line(x+20,142,x+20,y-7,edge,3);
    p.line(x-27,y-7,x-13,y-7,edge,2);p.line(x+13,y-7,x+27,y-7,edge,2);
    p.line(x-20,147,x+20,147,metal,3);
  };
  if(f.source==='vehicle'){
    // Use the same body alignment if an art file is still loading.
    const suppliedBody=p.image('props.obstacles.v2.vehicle.body',x-53,154,94,62);
    if(!suppliedBody){
      p.poly([[x-51,199],[x-46,173],[x-31,155],[x+17,155],[x+34,174],[x+40,199]],'#7e9488');
      p.rect(x-53,182,94,23,'#80998d');
      p.poly([[x-27,161],[x+20,161],[x+33,178],[x-27,178]],'#cbd6c8');
      p.line(x+5,159,x+5,204,'#3a5147',2);
      p.circle(x-32,207,9,'#394d49');p.circle(x+21,207,9,'#394d49');
      p.circle(x-32,207,4,'#b8c3b1');p.circle(x+21,207,4,'#b8c3b1');
      p.line(x-53,204,x+40,204,'#52695f',2);
    }
    if(f.progress>0){
      const closedLeft=x-14,hinge=x+5,leafLeft=closedLeft+6*f.progress,drop=11*f.progress;
      p.rect(closedLeft,b.y,hinge-closedLeft,41,'#34463d');
      p.line(closedLeft+1,b.y+17,hinge-1,b.y+17,'#778b7a',1);
      p.line(closedLeft+2,b.y+39,hinge-1,b.y+39,'#87967d',2);
      // Keep one occupant in the cabin, even when the procedural body is used.
      p.circle(x-3,174,3,'#535a4e');p.rect(x-7,178,9,7,'#63736a');
      p.poly([[leafLeft,215],[hinge,205],[hinge+5,219],[leafLeft-8,221]],'rgba(31,39,32,0.20)');
      p.poly([[leafLeft,b.y+drop],[hinge,b.y],[hinge,205],[leafLeft,205+drop]],'#668678');
      p.poly([[leafLeft+1,b.y+drop+3],[hinge-2,b.y+3],[hinge-2,b.y+15],[leafLeft+1,b.y+drop+15]],'#cad7c9');
      p.line(leafLeft,205+drop,hinge,205,'#354f43',2);
      p.line(leafLeft,b.y+drop,leafLeft,205+drop,'#b0c3ab',2);
      p.rect(leafLeft+2,b.y+drop+21,2,2,paper);
    }
    if(o.cueSeen&&f.progress<1)p.rect(x+34,186,5,4,'#e2bc68');
    return;
  }
  if(f.source==='cabinet'){
    p.rect(x-46,118,33,89,'#665b4b');p.rect(x-43,122,27,81,'#96876b');
    p.rect(x-47,116,35,5,'#b4a17c');p.rect(x-46,204,33,4,'#76674f');
    for(let yy=126;yy<200;yy+=5){
      p.line(x-42,yy,x-17,yy,yy%3?'#a79778':'#88785f',1);
      p.rect(x-39+(yy%4)*4,yy+1,2,2,'#81715a');
    }
    p.line(x-42,149,x-17,149,edge,2);p.line(x-42,178,x-17,178,edge,2);
    p.line(x-17,123,x-17,204,'#b5a07a',2);p.rect(x-23,159,3,6,'#665d4a');
    p.rect(x-45,128,3,7,'#bab397');p.rect(x-45,187,3,7,'#bab397');
    // The opened upper compartment remains in the cabinet; the hinged panel moves out.
    if(f.progress>.08){
      p.rect(x-41,156,24,37,'#4e5044');
      p.rect(x-38,160,13,4,'#d0c39e');p.rect(x-36,165,15,4,'#95856a');
      p.line(x-41,172,x-17,172,'#b7a17c',2);p.rect(x-37,180,6,9,'#859280');
      p.rect(x-29,178,8,11,'#b89d78');
    }
    if(f.progress>0){
      const w=b.w*f.progress;p.rect(b.x,b.y,w,b.h,'#8b7b61');
      p.line(b.x,b.y,b.x+w,b.y,'#bda981',2);
      for(let yy=b.y+5;yy<b.y+b.h-3;yy+=5){
        p.line(b.x+1,yy,b.x+w-1,yy,yy%2?'#a69673':'#746650',1);
      }
      p.line(b.x,b.y+b.h-1,b.x+b.w*f.progress,b.y+b.h-1,paper,2);
      if(f.progress>.35)p.rect(b.x+b.w*f.progress-5,b.y+15,2,7,wood);
    }
    return;
  }
  if(f.source==='banner'){
    rearPosts();
    const top=f.motion==='lowerBanner'?b.y-43*(1-f.progress):b.y;
    p.line(x-20,147,b.x,top,edge);p.line(x+20,147,b.x+b.w,top,edge);
    p.rect(b.x,top,b.w,b.h,'#c9ad79');
    p.line(b.x+4,top+7,b.x+b.w-4,top+7,'#f0dec0',2);
    p.line(b.x+5,top+14,b.x+b.w-5,top+14,'#866f56',1);
    p.line(b.x+5,top+22,b.x+b.w-5,top+22,'#f0dec0',1);
    if(f.motion==='lowerBanner'&&f.progress>0)p.line(x+20,147,x+26,158,edge);
    return;
  }
  shadow(o.kind==='tall'?34:32);
  if(f.source==='ball'){
    p.circle(x,y-10,10,/足球/.test(o.label)?paper:'#b69569');
    p.poly([[x-4,y-15],[x+3,y-16],[x+6,y-10],[x,y-6],[x-5,y-10]],edge);
    p.line(x-8,y-14,x-4,y-15,edge);p.line(x+6,y-10,x+9,y-7,edge);p.line(x,y-6,x-2,y-1,edge);
  }else if(f.source==='bicycle'){
    // Fallen bicycle: both wheels and the low frame lie on the pavement.
    p.circle(x-13,y-7,8,edge);p.circle(x+13,y-7,8,edge);
    p.circle(x-13,y-7,5,'#acb8a1');p.circle(x+13,y-7,5,'#acb8a1');
    p.line(x-13,y-7,x-4,y-18,wood,3);p.line(x-4,y-18,x+4,y-5,wood,3);
    p.line(x-13,y-7,x+4,y-5,wood,3);p.line(x+4,y-5,x+13,y-7,wood,3);
    p.line(x+13,y-7,x+7,y-18,wood,2);p.line(x+3,y-18,x+11,y-18,edge,2);
    p.line(x-8,y-19,x-1,y-19,edge,3);
  }else if(f.source==='satchel'){
    p.rect(b.x+1,b.y+1,b.w-2,b.h-2,'#a28863');
    p.rect(b.x+3,b.y+3,b.w-6,8,'#d0b589');p.rect(b.x+5,b.y+12,b.w-10,5,'#7f7259');
    p.line(x-4,b.y+1,x-4,b.y-3,edge,2);p.line(x-4,b.y-3,x+4,b.y-3,edge,2);p.line(x+4,b.y-3,x+4,b.y+1,edge,2);
    p.line(b.x,b.y+3,b.x-3,y-3,edge);p.line(b.x+b.w,b.y+3,b.x+b.w+3,y-3,edge);
  }else if(f.source==='step'){
    if(/讲台/.test(o.label)){
      // A classroom step belongs to the teacher's dais, not a street entrance.
      p.rect(x-28,187,58,20,'#89765a');p.rect(x-30,185,62,4,'#b49b74');
      p.line(x-24,191,x+25,191,'#c0a783',1);p.line(x-25,203,x+26,203,'#5e5d4c',2);
      for(let i=0;i<7;i++)p.line(x-23+i*7,190,x-23+i*7,205,'#76644d',1);
      p.rect(b.x,b.y,b.w,b.h,'#918979');p.line(b.x,b.y,b.x+b.w,b.y,paper,3);
      p.line(b.x+1,y-4,b.x+b.w-1,y-4,'#696c5d',1);return;
    }
    // The door alcove is scenery, with a raised stone doorstep projecting into the lane.
    p.rect(x-24,126,48,82,'#82735b');p.rect(x-20,130,40,75,'#574f42');
    p.rect(x-17,133,34,70,'#967e5f');p.rect(x-14,137,28,23,'#6f8075');
    p.line(x-14,137,x+14,137,'#b2ac88',2);p.line(x,138,x,160,'#c0af85',2);
    p.line(x-14,149,x+14,149,'#c0af85',2);p.line(x-11,139,x-7,146,'#c7c3a1');
    p.rect(x-14,165,28,24,'#806b53');p.line(x-12,167,x+12,167,'#b09972',1);
    p.line(x-12,186,x+12,186,'#b09972',1);p.rect(x+9,162,3,3,'#d7c299');
    p.line(x-24,127,x+24,127,'#bea783',3);p.line(x-24,127,x-24,208,'#a28f6c',3);
    p.line(x+22,127,x+22,208,'#6b5d49',3);
    p.poly([[x-28,207],[x+26,207],[x+32,211],[x-31,211]],'#989986');
    p.line(x-28,208,x+26,208,'#c8c3a2',2);
    for(let i=0;i<8;i++)p.rect(x-18+i*5,191+(i%2),2,1,'#b7a079');
    p.rect(b.x,b.y,b.w,b.h,'#8e907d');
    p.line(b.x,b.y,b.x+b.w,b.y,paper,3);p.line(b.x+1,y-7,b.x+b.w-1,y-7,'#686b5c',1);
    for(let i=0;i<4;i++)p.rect(b.x+3+i*5,b.y+5+(i%2)*4,2,1,'#b0ad90');
  }else if(f.source==='bucket'){
    if(/扫帚|簸箕/.test(o.label)){
      p.line(b.x+2,y-4,b.x+b.w-3,b.y+2,wood,4);
      p.poly([[b.x,b.y+6],[b.x+10,b.y+1],[b.x+12,y-2],[b.x+2,y-1]],'#bba876');
      p.poly([[x+1,y-12],[b.x+b.w,y-14],[b.x+b.w,y-1],[x+1,y-1]],metal);
    }else{
      p.line(x+1,b.y+2,x+7,b.y-30,wood,3);
      p.poly([[x+5,b.y-30],[x+12,b.y-31],[x+14,b.y-21],[x+4,b.y-19]],'#c6c2a3');
      p.poly([[b.x,b.y],[b.x+b.w,b.y],[b.x+b.w-3,y],[b.x+3,y]],metal);
      p.line(b.x,b.y+1,b.x+b.w,b.y+1,paper,2);p.line(b.x+4,b.y+3,b.x+4,y-3,'#91a69a',1);
    }
  }else if(f.source==='books'){
    for(let i=0;i<Math.ceil(b.h/7);i++){
      const yy=Math.max(b.y,y-(i+1)*7),shift=i%2?2:0;
      if(/软垫/.test(o.label)){
        p.poly([[b.x+shift+2,yy],[b.x+b.w-2,yy],[b.x+b.w,yy+2],[b.x+b.w-1,yy+6],[b.x+shift+1,yy+6],[b.x+shift,yy+2]],i%2?'#a0926e':'#8c9c88');
        p.line(b.x+shift+2,yy+5,b.x+b.w-2,yy+5,'#6b7b68',1);
        p.line(b.x+shift+3,yy+1,b.x+b.w-3,yy+1,'#c4c8a4',1);continue;
      }
      p.rect(b.x+shift,yy,b.w-shift,6,['#879688','#a18b6a','#b7ac88'][i%3]);
      p.rect(b.x+4+shift,yy+2,b.w-7-shift,2,paper);
    }
  }else if(f.source==='crate'){
    if(/课桌/.test(o.label)){
      p.rect(b.x,b.y,b.w,b.h,wood);p.rect(b.x+2,b.y+2,b.w-4,b.h-4,'#b3976e');
      p.line(b.x+3,b.y+6,b.x+b.w-3,b.y+6,paper,2);
      p.line(b.x+2,b.y+3,b.x+2,y-2,edge,3);p.line(b.x+b.w-2,b.y+3,b.x+b.w-2,y-2,edge,3);
      p.line(b.x+4,y-12,b.x+b.w-4,y-12,'#7e725b',2);return;
    }
    p.rect(b.x,b.y,b.w,b.h,wood);p.line(b.x+2,b.y+2,b.x+b.w-2,y-2,'#c1aa7e',2);
    p.line(b.x+b.w-2,b.y+2,b.x+2,y-2,'#c1aa7e',2);
    p.line(b.x,b.y+5,b.x+b.w,b.y+5,edge);p.line(b.x,y-5,b.x+b.w,y-5,edge);
  }else if(f.source==='lamp'){
    p.rect(x+19,133,4,72,metal);p.rect(x+9,204,23,4,edge);
    p.line(x+21,143,x-12,160,metal,4);
    p.line(x-12,160,x,b.y,metal,3);p.rect(x-3,b.y-3,6,3,edge);
    p.poly([[b.x,b.y],[b.x+b.w,b.y],[b.x+b.w-1,b.y+b.h],[b.x+1,b.y+b.h]],'#b3af85');
    p.line(b.x+3,b.y+b.h-3,b.x+b.w-3,b.y+b.h-3,'#eee0ab',3);
  }else if(f.source==='bench'){
    if(o.kind==='low'){
      p.line(b.x,b.y+3,b.x+b.w,y-3,wood,5);p.line(b.x+4,y-1,b.x+b.w-2,b.y+1,wood,4);
      p.line(b.x+1,b.y+1,b.x+4,y-1,edge,3);p.line(b.x+b.w-4,b.y+3,b.x+b.w,y-1,edge,3);
      return;
    }
    // Legs stand behind the running lane, with the seat/back extending into it.
    p.line(x-20,184,x-24,207,wood,3);p.line(x+20,184,x+24,207,wood,3);
    p.rect(b.x,184,b.w,5,wood);p.rect(b.x,b.y,b.w,b.h,color);
    for(let yy=b.y+5;yy<b.y+b.h;yy+=9)p.line(b.x+2,yy,b.x+b.w-2,yy,'#c7bc90',1);
  }else if(f.source==='awning'){
    // A narrow eave post and tied supports attach the cloth to the house; no fake wall slab.
    p.rect(x+21,107,6,101,'#796b55');p.line(x+22,108,x+22,205,'#b4a180',1);
    p.line(x+20,138,x-23,145,wood,4);p.line(x+21,144,x-19,154,wood,3);
    p.line(x-19,154,b.x,b.y,'#a99a76',1);
    p.poly([[b.x-4,b.y],[b.x+b.w+3,b.y],[b.x+b.w,b.y+b.h],[b.x,b.y+b.h]],'#b6ae8c');
    p.line(b.x,b.y+b.h,b.x+b.w,b.y+b.h,paper,3);
    p.line(x+22,156,x+11,186,wood,2);
    for(let i=0;i<5;i++)p.line(b.x+3+i*5,b.y+2,b.x+2+i*5,b.y+b.h-2,i%2?'#948e71':'#d0c7a6',1);
  }else if(f.source==='rubble'){
    if(o.kind==='high'){
      p.rect(x+20,114,10,94,'#56483e');p.line(x+24,153,x-15,158,'#80614d',5);
      p.poly([[b.x,b.y],[b.x+b.w,b.y+3],[b.x+b.w-2,b.y+b.h],[b.x+2,b.y+b.h-2]],'#745847');
      p.line(b.x+5,b.y+4,b.x+9,b.y+b.h-5,'#a27454',2);
    }else{
      p.poly([[b.x,b.y+4],[x-3,b.y],[b.x+b.w,b.y+3],[b.x+b.w-2,y],[b.x+1,y]],'#98735a');
      p.line(b.x+4,b.y+7,b.x+b.w-4,b.y+10,'#bc8e65',2);
    }
  }else{
    rearPosts();
    if(/跳绳/.test(o.label)){
      p.line(x-20,170,b.x,b.y+2,wood,2);p.line(b.x+b.w,b.y+2,x+20,170,wood,2);
      p.poly([[b.x,b.y+1],[b.x+8,b.y+7],[x,b.y+b.h-1],[b.x+b.w-8,b.y+7],[b.x+b.w,b.y+1],[b.x+b.w,b.y+4],[x,b.y+b.h],[b.x,b.y+4]],'#b3a172');
      return;
    }
    if(/书架/.test(o.label)){
      p.rect(x-23,148,5,60,wood);p.rect(x+18,148,5,60,wood);
      p.line(x-20,162,x+20,162,wood,4);p.line(x-20,201,x+20,201,wood,3);
      p.rect(x-17,153,5,8,'#879688');p.rect(x-10,151,4,10,'#b7ac88');
    }
    if(/滑梯/.test(o.label)){
      p.line(x-18,148,x-27,206,wood,3);p.line(x+20,148,x+35,207,'#b5a776',4);
      for(let yy=159;yy<203;yy+=10)p.line(x-25,yy,x-18,yy,metal,2);
    }
    // A broad crosspiece remains connected to visible uprights and a rear frame.
    p.rect(b.x,b.y,b.w,b.h,color);p.rect(b.x+2,b.y+2,b.w-4,3,'#c4c8a2');
    p.line(b.x+2,b.y+b.h-3,b.x+b.w-2,b.y+b.h-3,paper,2);
    if(/抹布/.test(o.label)){
      for(let i=0;i<3;i++)p.rect(b.x+3+i*8,b.y+3,6,b.h-4,['#c7c8ab','#a9b5a0','#c5ba9c'][i]);
    }
    p.line(x-20,170,b.x,170,metal,3);p.line(b.x+b.w,170,x+20,170,metal,3);
  }
}
