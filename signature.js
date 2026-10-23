// Source-derived Energy/GetPanel signing flow from supplied main.vue bundle.
// J(params): params.random = 12-digit random; clone params; keep scalar non-null/non-empty
// fields except signature; sort keys; JSON.stringify; MD5 uppercase; then add timestamp.
// This helper does not invent credentials or bypass authentication.
function wingoRandom12(){let n;do{n=Math.floor(Math.random()*1e12)}while(n<1e11);return String(n)}
function wingoMd5(input){
 const K=[],S=[7,12,17,22,5,9,14,20,4,11,16,23,6,10,15,21];
 for(let i=0;i<64;i++)K[i]=Math.floor(Math.abs(Math.sin(i+1))*4294967296)>>>0;
 const utf8=unescape(encodeURIComponent(input)),bytes=[];for(let i=0;i<utf8.length;i++)bytes.push(utf8.charCodeAt(i));
 const bitLen=bytes.length*8;bytes.push(128);while(bytes.length%64!==56)bytes.push(0);
 for(let i=0;i<8;i++)bytes.push(i<4?(bitLen>>> (8*i))&255:Math.floor(bitLen/4294967296)>>>((i-4)*8)&255);
 let a0=0x67452301|0,b0=0xefcdab89|0,c0=0x98badcfe|0,d0=0x10325476|0;
 for(let off=0;off<bytes.length;off+=64){const M=[];for(let j=0;j<16;j++)M[j]=(bytes[off+j*4]|bytes[off+j*4+1]<<8|bytes[off+j*4+2]<<16|bytes[off+j*4+3]<<24)|0;let A=a0,B=b0,C=c0,D=d0;
  for(let i=0;i<64;i++){let F,g,shift;if(i<16){F=(B&C)|(~B&D);g=i;shift=S[i%4]}else if(i<32){F=(D&B)|(~D&C);g=(5*i+1)%16;shift=S[4+i%4]}else if(i<48){F=B^C^D;g=(3*i+5)%16;shift=S[8+i%4]}else{F=C^(B|~D);g=(7*i)%16;shift=S[12+i%4]}const tmp=D;D=C;C=B;const x=(A+F+K[i]+M[g])|0;B=(B+((x<<shift)|(x>>>(32-shift))))|0;A=tmp;}
  a0=(a0+A)|0;b0=(b0+B)|0;c0=(c0+C)|0;d0=(d0+D)|0;
 }
 return [a0,b0,c0,d0].map(n=>[0,8,16,24].map(sh=>((n>>>sh)&255).toString(16).padStart(2,'0')).join('')).join('');
}
function wingoSignParams(params){
 const p={...params,random:wingoRandom12()};const scalar={};
 Object.keys(p).filter(k=>{const v=p[k];return k!=='signature'&&v!==null&&v!==''&&typeof v!=='object'}).sort().forEach(k=>{scalar[k]=p[k]===0?0:p[k]});
 p.signature=wingoMd5(JSON.stringify(scalar)).toUpperCase().slice(0,32);p.timestamp=Math.floor(Date.now()/1000);return p;
}
