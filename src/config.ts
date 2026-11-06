export function required(name:string){const value=process.env[name]?.trim();if(!value)throw new Error(`${name} belum diisi di .env.`);return value;}
export function mode(){const value=process.env.DATA_MODE??'demo';if(value!=='demo'&&value!=='henrik')throw new Error('DATA_MODE harus demo atau henrik.');return value;}
