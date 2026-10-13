const http=require('http'),path=require('path'),{spawn}=require('child_process');
const root=path.resolve(__dirname,'..'),url='http://127.0.0.1:4318/preview/';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function probe(){return new Promise(resolve=>{const req=http.get(url,res=>{let data='';res.setEncoding('utf8');res.on('data',s=>data+=s);res.on('end',()=>resolve(res.statusCode===200&&data.includes('<title>浮生 · 学堂</title>')?'ours':'other'));});req.on('error',()=>resolve('down'));req.setTimeout(1000,()=>{req.destroy();resolve('down');});});}
(async()=>{let state=await probe();if(state==='other')throw Error('Port 4318 is in use by another service. Close that service or change PORT in scripts/serve.cjs.');
if(state==='down'){spawn(process.execPath,[path.join(__dirname,'serve.cjs')],{cwd:root,stdio:'inherit',windowsHide:true});for(let i=0;i<40;i++){await sleep(200);state=await probe();if(state==='ours')break;}if(state!=='ours')throw Error('Preview server did not become ready.');}
const browser=spawn('powershell.exe',['-NoProfile','-Command',"Start-Process '"+url+"'"],{stdio:'ignore',windowsHide:true});browser.unref();console.log('Opened '+url);
})().catch(e=>{console.error(e.message);process.exitCode=1;});