'use strict';
// This file is the authored visual layout, not a replacement collision definition.
const fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'..'),out=path.join(root,'build/qa/obstacle-qwen-v2');
const {drawPhysicalObstacle}=require('../build/ObstacleRendering');
const sprites=[
 ['vehicle.body','开着的车门','tall',[-72,154,94,62],'dawn','a dusty green parked compact van, closed driver door, rubber wheels, glass windows, door seams, small adult driver silhouette inside glass only'],
 ['vehicle.door','开着的车门','tall',[-14,164,28,41],'dawn','one isolated matching green metal side door panel with glass, handle and hinges, no wheel'],
 ['cabinet.body','半开的储物柜门','high',[-48,116,36,100],'gray','old wooden storage cabinet standing on feet, the middle compartment open with books inside, no projecting door'],
 ['cabinet.door','半开的储物柜门','high',[-14,156,28,37],'gray','one separate rectangular brown wooden cabinet compartment door with handle and side hinges'],
 ['banner.frame','低下来的纪念横幅','high',[-29,140,58,76],'graduate','two thin aged wooden uprights with ground feet and a thin upper cross brace; a large entirely empty white opening, no cloth panel'],
 ['banner.cloth','低下来的纪念横幅','high',[-14,181,28,12],'graduate','a single narrow horizontal woven ochre cloth banner, stitched corners, soft folds, no lettering, no support posts'],
 ['ball','静静的皮球','low',[-12,195,24,21],'noon','small worn tan leather playground ball, curved stitched seams'],
 ['football','静止的足球','low',[-12,195,24,21],'playground','small worn ivory soccer ball with faded dark patches'],
 ['bicycle','倒下的自行车','low',[-12,193,24,23],'rain','a fallen small child bicycle, FORESHORTENED toward the camera so the two wheels overlap in depth, keep the compact almost-square 24:23 reference silhouette, all front wheels and frame stay within reference width, worn spokes and frame, no wide side-on standing bicycle'],
 ['satchel','落在路上的书包','low',[-16,193,32,23],'dawn','worn small ochre canvas school satchel with a stitched flap, pocket, buckles, handle and loose straps'],
 ['step','小小的台阶','low',[-32,125,64,91],'dawn','narrow old Chinese school wooden doorway and window panels in an aged plaster frame, with one stone doorstep at its base'],
 ['step.dais','讲台的台阶','low',[-32,185,64,31],'noon','a low wooden teacher platform behind a small stone step, horizontal wood grain and worn corners'],
 ['bucket.mop','拖把桶','low',[-14,163,28,53],'noon','dull galvanized cleaning bucket on the floor with one leaning wooden mop and visible cotton mop head'],
 ['bucket.broom','扫帚与簸箕','low',[-14,191,28,25],'gray','a fallen bamboo broom and an old metal dustpan, flat on the ground'],
 ['books.low','第一摞书','low',[-12,197,24,19],'night','a low uneven stack of worn school books with distinct paper page edges and muted cloth covers'],
 ['books.tall','高高的参考书','tall',[-14,164,28,52],'night','a tall uneven stack of worn reference books, several different thicknesses, distinct ivory page edges, muted blue brown cloth covers'],
 ['books.open','摊开的字典','low',[-12,197,24,19],'night','a thick open worn dictionary on the floor, pages and a visible spine, no readable words'],
 ['cushions','叠起的软垫','tall',[-14,164,28,52],'noon','stacked old blue green padded gym mats with soft rounded corners, visible stitched edges and creases'],
 ['crate.low','空木箱','low',[-12,197,24,19],'alley','a low old wooden crate with distinct planks, metal nails and diagonal brace'],
 ['crate.tall','装着旧书的箱子','tall',[-14,164,28,52],'graduate','a tall wooden crate with clear grain, planks, nails and diagonal bracing, worn warm brown surface'],
 ['crate.paper','办公桌旁的纸箱','tall',[-14,164,28,52],'gray','a tall old cardboard box with folded flaps, paper grain, tape seam and softened corners'],
 ['crate.folded','收起的课桌','tall',[-14,164,28,52],'graduate','a school desk folded upright with a worn wood desktop and clearly visible folded metal legs, no big solid cabinet'],
 ['brick','垫在地上的砖','low',[-12,197,24,19],'alley','a short irregular pile of aged clay bricks, individual brick faces, chipped edges'],
 ['bench.high','第二排椅背','high',[-27,179,54,37],'dusk','a raised wooden school bench with a BROAD THICK FRONT BACKBOARD. Its front board has a 28:12 width to height ratio, NOT a thin seat edge. Keep this large rectangular front board exactly as the reference, connected to the rear side legs, entirely clear beneath the front board'],
 ['bench.low','倒下的椅子','low',[-14,195,28,21],'gray','a fallen wooden school chair lying low, exposed seat boards and crossed chair legs'],
 ['lamp','台灯的横臂','high',[-16,131,50,85],'night','an old articulated metal task lamp on a floor stand at right, jointed arm slopes left, hanging wide shallow cream shade connected to the arm, base on floor'],
 ['rack','合影架的横杆','high',[-29,140,58,76],'graduate','an aged green metal photo equipment frame with two thin rear upright posts, feet on floor and one broad waist-level narrow crosspiece; entirely clear underneath crosspiece'],
 ['rack.rope','架起的跳绳','high',[-29,140,58,76],'noon','two wooden gym posts with feet and a short thick tan jump rope suspended between them, rope sag exactly as reference, clear air below'],
 ['rack.shelving','书架的隔板','high',[-28,146,56,70],'night','a narrow old wooden shelving frame, visible side legs, several books only on upper shelf, narrow projecting middle shelf, clear below middle shelf'],
 ['rack.slide','滑梯的横梁','high',[-29,140,66,76],'dawn','a small worn green school playground slide frame, short ladder on left and sloped chute on right behind lane, broad short crossbeam at reference height, clear under beam'],
 ['rack.cloth','晾着的抹布架','high',[-29,140,58,76],'noon','a freestanding old drying rack with two upright posts and feet, three short faded cleaning cloths on the narrow middle bar, clear below hanging cloths'],
 ['rack.tray','横着的茶水托盘','high',[-29,140,58,76],'dusk','an old narrow wooden tea tray stand with side supports, shallow horizontal tea tray exactly at reference bar height, small cups behind tray, clear open air beneath'],
 ['rack.hurdle','第一道跨栏','low',[-18,195,36,21],'playground','a short old athletic hurdle with narrow horizontal low bar and two side feet touching ground'],
 ['rack.mat','架起的体操垫','high',[-29,140,58,76],'playground','a narrow freestanding wooden gym rack with a small folded padded mat over the short middle bar, clear below the middle bar'],
 ['awning','屋檐下的晾衣杆','high',[-24,106,54,110],'alley','one weathered upright wooden eave support at right with sloped cross supports attached; thin ropes hold narrow faded canvas hanging panel at reference position, clear open air below panel'],
 ['rubble.high','倒塌走廊的横梁','high',[-16,112,49,104],'hell','a ruined burnt wooden upright at right with a broken beam extending left and a second cracked beam at reference narrow bar position, connected wood joints, entirely clear below the projecting beam'],
 ['rubble.low','断砖','low',[-12,197,24,19],'hell','a low heap of charred clay bricks and cracked plaster chunks on the ground'],
 ['face.wood','前木横板','high',[-14,181,28,12],'graduate','one broad rectangular wooden front backboard, width:height exactly 28:12, worn planks and grain, broad front face, no posts or legs'],
 ['face.metal','前金属横梁','high',[-14,181,28,12],'graduate','one broad rectangular dusty green metal crosspiece, width:height exactly 28:12, front face and shallow beveled top, rusty seams, no supports or legs'],
 ['face.lamp','灯罩前脸','high',[-14,181,28,12],'night','one shallow wide cream metal lamp shade, a trapezoid as in reference, width:height exactly 28:12, aged rim and warm light below, no lamp arm, no stand'],
 ['face.rope','跳绳前弧','high',[-14,181,28,12],'noon','one short thick tan cotton rope suspended in a U curve with clear individual braided fibers, exactly the reference curve and thickness, no poles or handles'],
 ['face.pad','折垫前脸','high',[-14,181,28,12],'noon','one broad rectangular folded muted green gym mat, width:height exactly 28:12, padded seams and rounded worn corners, no stand or supports'],
 ['face.burnt','断梁前脸','high',[-14,181,28,12],'hell','one broad short charred wooden beam with splintered ends, width:height exactly 28:12, cracked dark wood and burnt edges, no support post'],
 ['face.canvas','雨棚布面','high',[-14,181,28,12],'alley','one narrow rectangular faded canvas hanging panel, width:height exactly 28:12, stitched corners, small vertical creases, no ropes or support posts'],
 ['face.tray','茶盘前脸','high',[-14,181,28,12],'dusk','one broad shallow rectangular wooden tea tray front, width:height exactly 28:12, raised rim and worn front wood face, no cups or legs'],
 ['step.wall','门框两侧矮墙','low',[-9,137,18,68],'dawn','one narrow upright patch of old Chinese school facade wall, soft warm cream weathered plaster and exposed brick near the bottom, sides irregular, no doorway or window, no free-standing furniture, no roof or ground'],
 ['face.stone','门前三级石阶','low',[-12,197,24,19],'dawn','a tiny flight of three aged stone doorstep risers, preserve the exact stair silhouette and 24:19 width-to-height ratio, worn gray sandstone, three clear horizontal edges, shallow side view, no doorway or building'],
];
const manual=(id,p)=>{
 if(id==='bicycle'){
   p.circle(91,206,6,'#625f51');p.circle(91,206,4,'#a1a895');p.circle(98,207,9,'#525b51');p.circle(98,207,6,'#a6ae9e');
   p.line(85,204,96,195,'#8e775a',2);p.line(96,195,99,208,'#8e775a',2);p.line(85,204,99,208,'#8e775a',2);
   p.line(97,194,104,193,'#625f51',2);p.line(89,198,94,198,'#625f51',2);
   p.line(98,201,98,213,'#656d60',1);p.line(92,207,104,207,'#656d60',1);return true;
 }
 if(id==='step.wall'){p.rect(87,137,18,68,'#b1a080');p.line(88,140,88,204,'#d2c09e',1);for(let y=180;y<205;y+=6)p.line(88,y,104,y,'#85765e',1);return true;}
 if(id==='face.stone'){p.poly([[84,216],[84,209],[88,209],[88,203],[92,203],[92,197],[108,197],[108,216]],'#918e78');p.line(92,199,107,199,'#c8c2a1',1);p.line(88,205,107,205,'#c8c2a1',1);p.line(84,211,107,211,'#c8c2a1',1);return true;}
 if(id.startsWith('face.')){
   if(id==='face.rope'){p.poly([[82,181],[90,187],[96,190],[102,187],[110,181],[110,184],[102,190],[96,193],[90,190],[82,184]],'#a99a72');return true;}
   const c={'face.wood':'#977b59','face.metal':'#74887b','face.lamp':'#bab58e','face.pad':'#839b88','face.burnt':'#675448','face.canvas':'#afa789','face.tray':'#927454'}[id];
   if(id==='face.lamp')p.poly([[84,181],[108,181],[110,193],[82,193]],c);else p.rect(82,181,28,12,c);
   p.line(84,182,108,182,'#c4b491',1);p.line(84,191,108,191,'#736652',1);return true;
 }
 if(id==='books.open'){
   p.poly([[84,197],[96,201],[108,197],[108,211],[96,216],[84,211]],'#807354');
   p.poly([[85,198],[95,202],[95,213],[85,209]],'#d9c8a0');p.poly([[97,202],[107,198],[107,209],[97,213]],'#d9c8a0');
   p.line(96,202,96,214,'#5c5445',1);p.line(86,204,94,207,'#b09d77',1);p.line(98,207,106,204,'#b09d77',1);return true;
 }
 if(id==='crate.folded'){
   p.rect(82,164,28,7,'#aa8a5e');p.rect(84,171,24,40,'#96734e');
   p.line(84,173,102,214,'#617367',3);p.line(107,173,89,214,'#617367',3);
   p.line(89,195,102,195,'#9caa91',2);p.line(83,166,109,166,'#c9b78d',1);return true;
 }
 if(id==='bench.high'){
   p.line(76,183,72,215,'#947659',3);p.line(116,183,120,215,'#947659',3);
   p.line(76,184,83,186,'#947659',3);p.line(109,186,116,184,'#947659',3);
   p.rect(82,181,28,12,'#947659');p.line(83,182,109,182,'#c4ae85',1);p.line(84,188,108,188,'#6f5c46',1);
   p.line(84,192,108,192,'#c4ae85',1);return true;
 }
 if(id==='vehicle.door'){p.rect(82,164,28,41,'#738f80');p.rect(85,167,22,12,'#bdcec1');p.line(83,203,109,203,'#b8c8ad',2);p.rect(103,185,4,2,'#d4c8a8');return true;}
 if(id==='cabinet.door'){p.rect(82,156,28,37,'#8b7b61');p.line(83,158,108,158,'#b8a482',2);p.rect(104,172,2,6,'#625846');return true;}
 if(id==='banner.cloth'){p.rect(82,181,28,12,'#c9ad79');p.line(84,184,108,184,'#ded1a8',2);return true;}
 if(id==='banner.frame'){p.line(76,142,76,214,'#6e7560',3);p.line(116,142,116,214,'#6e7560',3);p.line(76,147,116,147,'#72826d',3);p.line(69,214,83,214,'#6e7560',2);p.line(109,214,123,214,'#6e7560',2);return true;}
 return false;
};
function record(row){
 const calls=[],p={image:()=>false,text:()=>{}};
 for(const name of ['rect','line','circle','poly'])p[name]=(...args)=>calls.push([name,...args]);
 if(!manual(row[0],p))drawPhysicalObstacle(p,{at:0,label:row[1],kind:row[2],eventElapsed:row[0]==='cabinet.body'?1:0},0,'#8c9279');
 return calls;
}
function main(){const corrections=['books.open','crate.folded','bench.high'],faces=sprites.filter(r=>r[0].startsWith('face.')).map(r=>r[0]);fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'authored-plan.json'),JSON.stringify({purpose:'All sprites are newly generated from local Qwen; geometry calls are only silhouette/layout guidance. Rejected early dictionary/desk/bench cells are replaced by correction plate 8. Independent faces keep the physical crosspieces registered to the collision layout.',plateSize:[1024,768],columns:3,rows:2,scale:2.65,sprites:sprites.map((r,i)=>{
 const correction=corrections.indexOf(r[0]),face=faces.indexOf(r[0]),last=['bicycle','step.wall','face.stone'].indexOf(r[0]);
 return {id:r[0],label:r[1],kind:r[2],box:r[3],theme:r[4],description:r[5],plate:last>=0?10:correction>=0?8:face>=0?(face<3?8:9):Math.floor(i/6)+1,
   cell:last>=0?last:correction>=0?correction:face>=0?(face<3?face+3:face-3):i%6,calls:record(r)};
})},null,2));console.log('Authored '+sprites.length+' sprites; original 7 plates plus corrections/modular faces in 8–9');}
if(require.main===module)main();module.exports={sprites};
