export default async function handler(req,res){
  if(req.method==='OPTIONS')return res.status(200).end();
  const a={};
  if(process.env.GROQ_API_KEY)a.Groq='✅';
  if(process.env.GEMINI_API_KEY)a.Gemini='✅';
  if(process.env.HF_MODEL_REPO)a['GAIA Model']='✅ '+process.env.HF_MODEL_REPO;
  return res.json({ok:true,apis:a,versao:'2.0',arquitectura:'cebola',nucleos:6,independente:!!process.env.HF_MODEL_REPO});
}
