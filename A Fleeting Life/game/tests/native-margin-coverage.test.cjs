'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
function sourceMargins(){
  let ts;
  for(const candidate of [process.env.TYPESCRIPT_PATH,path.resolve(root,'../需要的软件/CocosCreator/3.8.8/resources/app.asar.unpacked/node_modules/typescript'),path.resolve(root,'node_modules/typescript')].filter(Boolean)){
    try{ts=require(candidate);break;}catch{}
  }
  assert.ok(ts,'installed Cocos TypeScript runtime must be available');
  const source=fs.readFileSync(path.join(root,'assets/scripts/Bootstrap.ts'),'utf8');
  const start=source.indexOf('type MarginPalette='),end=source.indexOf('\ntype GraphicOp =',start);
  assert.ok(start>=0&&end>start,'run the real native margin helpers');
  const context={module:{exports:{}}};
  vm.runInNewContext(ts.transpileModule(source.slice(start,end)+'\nmodule.exports={drawWideMargins,drawWideMarginOverlays};',
    {compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS}}).outputText,context);
  return context.module.exports;
}
const {drawWideMargins,drawWideMarginOverlays}=sourceMargins();
function capture(){
  const rects=[];
  return {rects,rect(x,y,w,h,color){rects.push({x,y,w,h,color});},line(){},poly(){}};
}
function game(overrides={}){
  return {screen:'play',phase:'run',theme:'dawn',settings:{reducedMotion:false},time:9,phaseTime:1,sceneTime:1,choice:0,branch:'',panel:'',paused:false,...overrides};
}
// Partition every rectangle boundary, so a narrow unpainted edge cannot hide between sample points.
function assertCovered(rects,width,height,label){
  const left=-(width-480)/2,right=480+(width-480)/2,top=-(height-270)/2,bottom=270+(height-270)/2;
  const xs=[...new Set([left,0,480,right,...rects.flatMap(r=>[r.x,r.x+r.w]).filter(x=>x>left&&x<right)])].sort((a,b)=>a-b);
  const ys=[...new Set([top,0,270,bottom,...rects.flatMap(r=>[r.y,r.y+r.h]).filter(y=>y>top&&y<bottom)])].sort((a,b)=>a-b);
  for(let i=1;i<xs.length;i++)for(let j=1;j<ys.length;j++){
    const x=(xs[i-1]+xs[i])/2,y=(ys[j-1]+ys[j])/2;
    if(x>=0&&x<480&&y>=0&&y<270)continue;
    assert.ok(rects.some(r=>x>=r.x&&x<r.x+r.w&&y>=r.y&&y<r.y+r.h),`${label}: uncovered (${x}, ${y})`);
  }
}

test('native scenery covers wide, tall, odd and fractional visible bounds including all four corners',()=>{
  const frames=[[480,270],[600,270],[480,1066.6666666667],[800,450],[641,333],[480.25,270.25]];
  const scenes=[game({screen:'hall'}),game({phase:'corridorTransition'}),game({phase:'finale'}),game({phase:'ending'}),
    ...['dawn','rain','noon','gray','dusk','night','graduate','dream','heaven','hell'].map(theme=>game({theme})),
    game({branch:'alley'}),game({branch:'playground'}),game({phase:'choice',choice:3})];
  for(const [width,height] of frames)for(const state of scenes){
    const p=capture();drawWideMargins(p,state,width,height);
    const opaque=p.rects.filter(r=>/^#[0-9a-f]{6}$/i.test(r.color));
    assertCovered(opaque,width,height,`${state.screen}/${state.phase}/${state.theme}/${width}x${height}`);
    for(const r of p.rects)assert.ok([r.x,r.y,r.w,r.h].every(Number.isFinite)&&r.w>0&&r.h>0);
  }
});

test('top and bottom continue the hallway, scene and ending palette with constant added work',()=>{
  for(const [state,topColor,bottomColor] of [
    [game({screen:'hall'}),'#e9e9dd','#c9d1c2'],
    [game({phase:'corridorTransition'}),'#e9e9dd','#c9d1c2'],
    [game({theme:'rain'}),'#aebfc4','#476d6c'],
    [game({phase:'finale'}),'#172825','#172825'],
    [game({phase:'ending'}),'#172825','#172825'],
  ]){
    const p=capture();drawWideMargins(p,state,480,1800);
    assert.equal(p.rects.length,2,'tall scenery adds only the two full edge fills');
    assert.equal(p.rects[0].color,topColor);assert.equal(p.rects[1].color,bottomColor);
    assert.equal(p.rects[0].y+p.rects[0].h,0);assert.equal(p.rects[1].y,270);
  }
});

test('pause, panel and opening masks cover top, bottom, sides and corners without dimming the core twice',()=>{
  for(const [state,color] of [[game({paused:true}),'rgba(23,40,34,0.65)'],
    [game({panel:'settings'}),'rgba(29,46,40,0.45)'],
    [game({phase:'intro',phaseTime:2}),'#334941']]){
    for(const [width,height] of [[600,270],[480,800],[641,333],[480.25,270.25]]){
      const p=capture();drawWideMarginOverlays(p,state,width,height);
      const mask=p.rects.filter(r=>r.color===color);assertCovered(mask,width,height,color);
      for(const r of mask)assert.ok(r.x+r.w<=0||r.x>=480||r.y+r.h<=0||r.y>=270,'mask stays outside the core UI');
      for(let i=0;i<mask.length;i++)for(let j=i+1;j<mask.length;j++){
        const a=mask[i],b=mask[j];
        assert.ok(Math.min(a.x+a.w,b.x+b.w)<=Math.max(a.x,b.x)||Math.min(a.y+a.h,b.y+b.h)<=Math.max(a.y,b.y),'edge masks do not double-darken corners');
      }
    }
  }
});

test('the header shade reaches the top corners and matches the core HUD height',()=>{
  const p=capture();drawWideMarginOverlays(p,game({phase:'choice',theme:'night'}),641,333);
  const header=p.rects.filter(r=>r.color==='rgba(24,43,50,0.47)');
  assert.ok(header.some(r=>r.x===-80.5&&r.y===0&&r.w===80.5&&r.h===25));
  assert.ok(header.some(r=>r.x===480&&r.y===0&&r.w===80.5&&r.h===25));
  assert.ok(header.every(r=>r.y===0&&r.y+r.h<=25));
  assert.equal(header.some(r=>r.y<0),false,'vertical surplus keeps the authored scene edge');
  assert.equal(p.rects.some(r=>r.y>=270),false);
});
