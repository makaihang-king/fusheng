const http=require('http'),fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'..');const port=Number(process.env.PORT||4318);
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.css':'text/css; charset=utf-8','.ttf':'font/ttf','.png':'image/png','.jpg':'image/jpeg','.wav':'audio/wav','.ogg':'audio/ogg','.mp4':'video/mp4','.webm':'video/webm'};
function createServer(contentRoot=root){return http.createServer((req,res)=>{let pathname;try{pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);}catch{res.writeHead(400);res.end();return;}
if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405,{'Allow':'GET, HEAD'});res.end();return;}
let target=path.resolve(contentRoot,'.'+pathname);if(target!==contentRoot&&!target.startsWith(contentRoot+path.sep)){res.writeHead(403);res.end();return;}
if(fs.existsSync(target)&&fs.statSync(target).isDirectory())target=path.join(target,'index.html');
if(!fs.existsSync(target)||!fs.statSync(target).isFile()){res.writeHead(404);res.end('Not found');return;}
const size=fs.statSync(target).size;
const headers={'Content-Type':mime[path.extname(target)]||'application/octet-stream','Cache-Control':'no-store','Accept-Ranges':'bytes'};
let start=0,end=size-1,status=200;
// 结局视频首播、暂停续播和重看都需要可靠的字节范围请求。
if(req.headers.range){
 const match=/^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
 if(match&&(match[1]||match[2])){
  if(!match[1]){const suffix=Number(match[2]);start=Math.max(0,size-suffix);}
  else{start=Number(match[1]);end=match[2]?Math.min(size-1,Number(match[2])):size-1;}
 }
 if(!match||!(match[1]||match[2])||!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start>end||start>=size||(!match[1]&&Number(match[2])<=0)){
  res.writeHead(416,{...headers,'Content-Range':'bytes */'+size,'Content-Length':0});res.end();return;
 }
 status=206;headers['Content-Range']=`bytes ${start}-${end}/${size}`;
}
headers['Content-Length']=Math.max(0,end-start+1);
res.writeHead(status,headers);
if(req.method==='HEAD'||size===0){res.end();return;}
const stream=fs.createReadStream(target,{start,end});
stream.on('error',()=>res.destroy());res.on('close',()=>stream.destroy());stream.pipe(res);
});}
module.exports={createServer};
if(require.main===module)createServer().listen(port,'127.0.0.1',()=>console.log('浮生 S1 — http://127.0.0.1:'+port+'/preview/ (Ctrl+C to stop)'));
