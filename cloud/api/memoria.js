import{kv}from'@vercel/kv';
export default async function handler(req,res){
  if(req.method==='OPTIONS')return res.status(200).end();
  const u=req.query.userId||req.body?.userId||'ivo';const k='gaia:mem:'+u;
  if(req.method==='GET'){const m=await kv.get(k).catch(()=>null);return res.json({memoria:m||{semantica:{factos:[],preferencias:[],objetivos:[],decisoes:[]}}});}
  if(req.method==='POST'){await kv.set(k,req.body?.memoria,{ex:63072000}).catch(()=>{});return res.json({ok:true});}
  if(req.method==='DELETE'){await kv.del(k).catch(()=>{});return res.json({ok:true});}
  return res.status(405).end();
}
