import{kv}from'@vercel/kv';
export default async function handler(req,res){
  if(req.method==='OPTIONS')return res.status(200).end();
  const u=req.query.userId||req.body?.userId||'ivo';const k='gaia:docs:'+u;
  if(req.method==='GET'){const d=await kv.get(k).catch(()=>null)||[];return res.json({documentos:d,totalChunks:d.reduce((a,x)=>a+(x.totalChunks||0),0)});}
  if(req.method==='POST'){const{nome,tipo,conteudo,url}=req.body||{};const docs=await kv.get(k).catch(()=>null)||[];const doc={id:Date.now().toString(),nome,tipo,conteudo:conteudo?.slice(0,50000),url,indexado:new Date().toISOString(),totalChunks:Math.ceil((conteudo?.length||0)/3200),tamanho:conteudo?.length||0};docs.push(doc);await kv.set(k,docs,{ex:31536000}).catch(()=>{});return res.json({ok:true,doc});}
  if(req.method==='DELETE'){const{docId}=req.body||{};const docs=(await kv.get(k).catch(()=>null)||[]).filter(d=>d.id!==docId);await kv.set(k,docs,{ex:31536000}).catch(()=>{});return res.json({ok:true});}
  return res.status(405).end();
}
