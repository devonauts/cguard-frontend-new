/**
 * Escena 3D de ronda — CGuard Pro
 *
 * Una instalación de noche en 3D real (WebGL): torre de oficinas de vidrio,
 * almacén, taller de ladrillo y garita con texturas propias y ventanas
 * encendidas; cámaras de vigilancia con su cono de visión barriendo; coches
 * aparcados, árboles, farolas, valla perimetral y pluma de acceso. Los
 * vigilantes caminan sus rutas y, al pasar por un punto de control, el punto
 * se pone verde y se llama a `onPunto`. El supervisor recorre el recinto en
 * una pickup con sirenas naranjas.
 *
 * Se hizo para el registro (diseño «Ronda en 3D», 2026-10-03) y se guarda
 * aquí para reutilizarlo en otras páginas.
 *
 * Uso:
 *   import * as THREE from "three";          // o window.THREE (probado con r128)
 *   import { montarEscenaRonda3D } from "@/components/escena-ronda-3d/escenaRonda3d";
 *   const escena = montarEscenaRonda3D(div, {
 *     THREE,
 *     onPunto: ({ vigilante, punto, hechos, total }) => { ... },
 *     onSegundo: (s) => { ... },
 *   });
 *   // al desmontar:
 *   escena.destruir();
 *
 * El contenedor debe tener tamaño (p. ej. aspect-ratio: 16/11). Si mide 0
 * (oculto en el teléfono) no se crea nada hasta que tenga tamaño.
 *
 * Opciones:
 *   THREE              la librería (por defecto globalThis.THREE)
 *   vigilantes         [{ id, nombre, c (color), v (velocidad), ruta: [[x,y]…], d (salida) }]
 *   puntos             [{ n (nombre), x, y }]  — coordenadas en % del recinto (0-100)
 *   supervisor         { etiqueta, ruta, velocidad } | false
 *   movimientoReducido true = un solo fotograma, sin animación
 *   onPunto, onReinicio, onSegundo
 *
 * Con three r155+ las luces pasan a unidades físicas: se activa
 * useLegacyLights cuando existe (r155–r164). En r165+ hay que subir las
 * intensidades de PointLight/SpotLight.
 */

const VIGILANTES = [
  { id: "V01", nombre: "Ramón Ortiz", c: "#8fb8ff", v: 9, ruta: [[3, 4], [97, 4], [97, 96], [3, 96]], d: 30 },
  { id: "V02", nombre: "Luis Andrade", c: "#4ade80", v: 7.5, ruta: [[48, 90], [48, 54], [23, 54], [48, 54], [48, 30], [48, 43], [88, 43], [48, 43]], d: 12 },
];
const PUNTOS = [
  { n: "Perímetro norte", x: 48, y: 4 }, { n: "Puerta del almacén", x: 48, y: 30 }, { n: "Oficinas", x: 72, y: 43 },
  { n: "Estacionamiento", x: 23, y: 54 }, { n: "Muro este", x: 97, y: 60 }, { n: "Acceso principal", x: 48, y: 96 },
];
const SUPERVISOR = { etiqueta: "SUPERVISOR", velocidad: 3.2, ruta: [[8, 54], [48, 54], [48, 43], [90, 43], [48, 43], [48, 8], [48, 43], [48, 54]] };

const CSS = `
.cg-r3d{position:relative;overflow:hidden}
.cg-r3d>canvas{position:absolute;inset:0;width:100%;height:100%;display:block}
.cg-r3d-capa{position:absolute;inset:0;pointer-events:none;overflow:hidden}
.cg-r3d-v,.cg-r3d-e{position:absolute;left:0;top:0;will-change:transform}
.cg-r3d-v{display:flex;flex-direction:column;align-items:center}
.cg-r3d-v b{font:700 11px var(--f-mono,ui-monospace,Menlo,monospace);color:#fff;background:rgba(8,13,24,.85);border:1px solid var(--c);padding:2px 7px;border-radius:6px;box-shadow:0 0 14px color-mix(in srgb,var(--c) 55%,transparent)}
.cg-r3d-v s{display:block;width:2px;height:16px;background:linear-gradient(var(--c),transparent);text-decoration:none}
.cg-r3d-sup b{animation:cg-r3d-sirena .4s steps(1) infinite}
@keyframes cg-r3d-sirena{50%{border-color:#ffd166;box-shadow:0 0 18px rgba(255,170,40,.85)}}
.cg-r3d-e{font:500 9px var(--f-mono,ui-monospace,Menlo,monospace);letter-spacing:.14em;text-transform:uppercase;color:#cfdcf5;background:rgba(6,10,20,.6);border:1px solid rgba(143,184,255,.25);padding:3px 7px;border-radius:5px;white-space:nowrap;backdrop-filter:blur(6px)}
@media (prefers-reduced-motion:reduce){.cg-r3d-sup b{animation:none}}
`;

export function montarEscenaRonda3D(contenedor, opciones = {}) {
    const T = opciones.THREE || globalThis.THREE;
    if (!contenedor || !T) throw new Error("montarEscenaRonda3D: falta el contenedor o THREE");
    if (!document.getElementById("cg-r3d-css")) {
      const st = document.createElement("style"); st.id = "cg-r3d-css"; st.textContent = CSS; document.head.appendChild(st);
    }
    contenedor.classList.add("cg-r3d");
    const lienzo = document.createElement("canvas"); lienzo.setAttribute("aria-hidden", "true");
    const capa = document.createElement("div"); capa.className = "cg-r3d-capa";
    contenedor.append(lienzo, capa);

    const copia = (x) => JSON.parse(JSON.stringify(x));
    const PCS = copia(opciones.puntos || PUNTOS);
    const VIGS = copia(opciones.vigilantes || VIGILANTES);
    const SUP = opciones.supervisor === false ? null : { ...SUPERVISOR, ...(opciones.supervisor || {}) };
    const quieto = opciones.movimientoReducido ?? matchMedia("(prefers-reduced-motion: reduce)").matches;

    const A=(x,y,h)=>new T.Vector3(x-50,h||0,(y-50)*.7);
    let semilla=11;const r=()=>(semilla=(semilla*16807)%2147483647)/2147483647;
    function preparaRuta(g){const pts=g.ruta.concat([g.ruta[0]]);g.seg=[];let L=0;
      for(let k=0;k<pts.length-1;k++){const a=pts[k],b=pts[k+1],l=Math.hypot(b[0]-a[0],b[1]-a[1]);g.seg.push({a,b,l,ini:L});L+=l;}g.L=L;}
    function posicion(g,d){d=((d%g.L)+g.L)%g.L;for(const s of g.seg){if(d<=s.ini+s.l){const t=(d-s.ini)/s.l;return [s.a[0]+(s.b[0]-s.a[0])*t,s.a[1]+(s.b[1]-s.a[1])*t];}}return g.seg[0].a;}

    let renderer,scene,cam,iniciado=false,visible=true,parado=false,raf=0;
    const anim={leds:[],camaras:[],pulsos:[],vigs:[],patrulla:null,barras:[]};

    function iniciar(){
      const W=contenedor.clientWidth,H=contenedor.clientHeight; if(W<60||H<60) return;
      iniciado=true;
      renderer=new T.WebGLRenderer({canvas:lienzo,antialias:true,alpha:true,powerPreference:"high-performance"});
      renderer.setPixelRatio(Math.min(2,devicePixelRatio||1));renderer.setSize(W,H,false);renderer.setClearColor(0x000000,0);
      if("outputColorSpace" in renderer) renderer.outputColorSpace=T.SRGBColorSpace; else renderer.outputEncoding=T.sRGBEncoding;
      if("useLegacyLights" in renderer) renderer.useLegacyLights=true;
      renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.15;
      renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;
      scene=new T.Scene();scene.fog=new T.Fog(0x04070d,170,380);
      cam=new T.PerspectiveCamera(30,W/H,1,700);
      const aniso=renderer.capabilities.getMaxAnisotropy();
      const tex=c=>{const t=new T.CanvasTexture(c);if("colorSpace" in t) t.colorSpace=T.SRGBColorSpace; else t.encoding=T.sRGBEncoding;t.anisotropy=aniso;return t;};
      const std=(o)=>new T.MeshStandardMaterial(o);
      const malla=(geo,mat,sombra)=>{const m=new T.Mesh(geo,mat);if(sombra!==false){m.castShadow=true;m.receiveShadow=true;}return m;};

      // luces de noche
      scene.add(new T.HemisphereLight(0x8fb0ff,0x0a0f1a,.55));
      scene.add(new T.AmbientLight(0x30405f,.35));
      const luna=new T.DirectionalLight(0xc6d6ff,.95);luna.position.set(-55,95,45);luna.castShadow=true;
      Object.assign(luna.shadow.camera,{left:-75,right:75,top:60,bottom:-60,near:10,far:260});
      luna.shadow.mapSize.set(2048,2048);luna.shadow.bias=-.0004;luna.shadow.normalBias=.03;scene.add(luna);

      // suelo: fuera y dentro del recinto
      const fuera=new T.Mesh(new T.PlaneGeometry(900,900),new T.MeshBasicMaterial({color:0x04070d}));fuera.rotation.x=-Math.PI/2;fuera.position.y=-.05;fuera.receiveShadow=true;scene.add(fuera);
      {
        const K=14,c=document.createElement("canvas");c.width=100*K;c.height=70*K;const g=c.getContext("2d");
        const X=x=>x*K,Y=y=>y*.7*K;
        g.fillStyle="#182131";g.fillRect(0,0,c.width,c.height);
        for(let i=0;i<9000;i++){g.fillStyle=`rgba(${r()<.5?255:0},${r()<.5?255:0},255,${r()*.04})`;g.fillRect(r()*c.width,r()*c.height,2,2);}
        g.fillStyle="#13291c";[[0,0,100,3.4],[0,96.6,44,3.4],[52,96.6,48,3.4],[0,0,2.4,100],[97.6,0,2.4,100]].forEach(([x,y,w,h])=>g.fillRect(X(x),Y(y),X(w),Y(h)));
        g.fillStyle="#2a3346";[[6.5,12.5,33,36],[55.5,10.5,34,27],[58.5,50.5,29,21],[53.5,80.5,11,12]].forEach(([x,y,w,h])=>g.fillRect(X(x),Y(y),X(w),Y(h)));
        g.fillStyle="#0e131c";[[45,0,6,100],[40,40.5,60,5],[0,51.5,45,5]].forEach(([x,y,w,h])=>g.fillRect(X(x),Y(y),X(w),Y(h)));
        g.strokeStyle="rgba(230,190,80,.8)";g.lineWidth=3;g.setLineDash([22,18]);
        [[48,1,48,99],[51,43,99,43],[1,54,45,54]].forEach(([a,b,c2,d])=>{g.beginPath();g.moveTo(X(a),Y(b));g.lineTo(X(c2),Y(d));g.stroke();});
        g.setLineDash([]);g.strokeStyle="rgba(235,240,250,.7)";g.lineWidth=3;
        for(let x=10;x<=40;x+=6){g.beginPath();g.moveTo(X(x),Y(63));g.lineTo(X(x),Y(73));g.stroke();g.beginPath();g.moveTo(X(x),Y(77));g.lineTo(X(x),Y(87));g.stroke();}
        g.fillStyle="rgba(235,240,250,.75)";for(let y=91;y<99;y+=1.6)g.fillRect(X(45),Y(y),X(6),Y(.7));
        const lote=malla(new T.PlaneGeometry(100,70),std({map:tex(c),roughness:.95}),false);lote.rotation.x=-Math.PI/2;lote.receiveShadow=true;scene.add(lote);
      }

      // texturas de fachada y techo (con ventanas que emiten luz)
      const PXU=16;
      const cv=(wu,hu)=>{const c=document.createElement("canvas");c.width=Math.min(2048,Math.max(16,Math.round(wu*PXU)));c.height=Math.min(2048,Math.max(16,Math.round(hu*PXU)));return [c,c.getContext("2d")];};
      function fachada(tipo,wu,hu){
        const [c,g]=cv(wu,hu),[e,ge]=cv(wu,hu),W=c.width,H=c.height,k=W/wu;
        ge.fillStyle="#000";ge.fillRect(0,0,W,H);
        const luz=(x,y,w,h,col,em)=>{g.fillStyle=col;g.fillRect(x,y,w,h);if(em){ge.fillStyle=em;ge.fillRect(x,y,w,h);}};
        if(tipo==="torre"){
          g.fillStyle="#1b2639";g.fillRect(0,0,W,H);
          const fh=3.4*k,cw=1.8*k,lobby=4.2*k;
          for(let y=.6*k;y+fh<=H-lobby+.1;y+=fh){
            g.fillStyle="#4a556d";g.fillRect(0,y+fh-.4*k,W,.4*k);
            for(let x=.25*k;x+cw<=W-.15*k;x+=cw){const v=r(),wx=x+.12*k,wy=y+.2*k,ww=cw-.24*k,wh=fh-.75*k;
              if(v<.34){const col=`rgb(255,${205+r()*35|0},${135+r()*45|0})`;luz(wx,wy,ww,wh,col,col);}
              else if(v<.44) luz(wx,wy,ww,wh,"#9cc0f0","#1c2a44");
              else luz(wx,wy,ww,wh,r()<.5?"#0c1524":"#122038");}
          }
          const gr=g.createLinearGradient(0,0,W,H);gr.addColorStop(0,"rgba(255,255,255,0)");gr.addColorStop(.42,"rgba(210,230,255,.14)");gr.addColorStop(.5,"rgba(210,230,255,0)");g.fillStyle=gr;g.fillRect(0,0,W,H);
          g.fillStyle="#2e384c";g.fillRect(0,H-lobby,W,lobby);
          luz(.6*k,H-lobby+.5*k,W-1.2*k,lobby-.9*k,"#ffe0a8","#ffd99a");
          for(let x=.6*k;x<W-.6*k;x+=2.2*k){g.fillStyle="#2b3346";g.fillRect(x,H-lobby+.5*k,.15*k,lobby-.9*k);}
        }else if(tipo==="nave"||tipo==="taller"){
          const ladrillo=tipo==="taller";
          g.fillStyle=ladrillo?"#5b4134":"#5d6a83";g.fillRect(0,0,W,H);
          if(ladrillo){for(let y=0,f=0;y<H;y+=.35*k,f++){for(let x=(f%2)*.45*k;x<W;x+=.9*k){g.fillStyle=`rgba(0,0,0,${.12+r()*.12})`;g.fillRect(x,y,.05*k,.35*k);}g.fillStyle="rgba(0,0,0,.22)";g.fillRect(0,y,W,.04*k);}}
          else for(let x=0;x<W;x+=.45*k){g.fillStyle=(x/(.45*k))%2<1?"rgba(255,255,255,.07)":"rgba(0,0,0,.2)";g.fillRect(x,0,.22*k,H);}
          for(let x=.8*k;x+2.6*k<W;x+=3.4*k){const on=r()<.55;luz(x,.9*k,2.6*k,.9*k,on?"#ffd99a":"#8fa8cc",on?"#ffcf86":null);}
          const n=Math.max(1,Math.floor(wu/8.5)),dw=3.8*k,dh=Math.min(H*.6,4.6*k);
          for(let i=0;i<n;i++){const x=(W/n)*(i+.5)-dw/2;
            g.fillStyle="#2e3646";g.fillRect(x-.2*k,H-dh-.2*k,dw+.4*k,dh+.2*k);
            g.fillStyle="#8a95a8";g.fillRect(x,H-dh,dw,dh);
            for(let y=H-dh;y<H;y+=.32*k){g.fillStyle="rgba(0,0,0,.28)";g.fillRect(x,y,dw,.07*k);}
            luz(x+dw/2-.5*k,H-dh-.75*k,k,.3*k,"#fff1cf","#ffe6b0");}
          luz(W-2.2*k,H-2.3*k,1*k,2.3*k,"#3a4356");luz(W-2.05*k,H-2.15*k,.7*k,.7*k,"#ffd99a","#ffcf86");
          g.fillStyle="rgba(210,225,255,.35)";g.fillRect(0,0,W,.18*k);
        }else{
          g.fillStyle="#3d475b";g.fillRect(0,0,W,H);
          luz(.3*k,.9*k,W-.6*k,H-1.9*k,"#ffe0a6","#ffd690");
          for(let x=.3*k;x<W-.3*k;x+=1.3*k){g.fillStyle="#252d3d";g.fillRect(x,.9*k,.1*k,H-1.9*k);}
          g.fillStyle="#1d2433";g.fillRect(0,0,W,.7*k);
        }
        return std({map:tex(c),emissiveMap:tex(e),emissive:0xffffff,emissiveIntensity:1.05,roughness:tipo==="torre"?.32:.82,metalness:tipo==="torre"?.45:.15});
      }
      function techo(tipo,wu,du){
        const [c,g]=cv(wu,du),[e,ge]=cv(wu,du),W=c.width,H=c.height,k=W/wu;
        ge.fillStyle="#000";ge.fillRect(0,0,W,H);
        if(tipo==="nave"||tipo==="taller"){
          g.fillStyle=tipo==="taller"?"#4a4f5c":"#56627a";g.fillRect(0,0,W,H);
          for(let y=0;y<H;y+=.45*k){g.fillStyle=(y/(.45*k))%2<1?"rgba(255,255,255,.07)":"rgba(0,0,0,.18)";g.fillRect(0,y,W,.22*k);}
          for(let x=W*.1;x<W*.88;x+=W*.2){g.fillStyle="#9bbbe0";g.fillRect(x,H*.18,W*.09,H*.64);ge.fillStyle="#24344d";ge.fillRect(x,H*.18,W*.09,H*.64);}
        }else{
          g.fillStyle="#353e52";g.fillRect(0,0,W,H);
          g.strokeStyle="rgba(255,255,255,.07)";g.lineWidth=1;
          for(let x=0;x<W;x+=1.5*k){g.beginPath();g.moveTo(x,0);g.lineTo(x,H);g.stroke();}
          for(let y=0;y<H;y+=1.5*k){g.beginPath();g.moveTo(0,y);g.lineTo(W,y);g.stroke();}
          if(tipo==="torre"){g.strokeStyle="rgba(245,195,0,.7)";g.lineWidth=.25*k;g.beginPath();g.arc(W*.3,H*.62,2.2*k,0,7);g.stroke();
            g.fillStyle="rgba(245,195,0,.8)";g.font=`700 ${2.4*k}px sans-serif`;g.textAlign="center";g.textBaseline="middle";g.fillText("H",W*.3,H*.62);}
        }
        return std({map:tex(c),emissiveMap:tex(e),emissive:0xffffff,roughness:.9});
      }
      const gris=std({color:0x6d778a,roughness:.6,metalness:.5}),grisOsc=std({color:0x2b3242,roughness:.7,metalness:.4});
      const caja=(w,h,d,mat,x,y,z,padre)=>{const m=malla(new T.BoxGeometry(w,h,d),mat);m.position.set(x,y,z);(padre||scene).add(m);return m;};
      const cil=(rt,rb,h,mat,x,y,z,padre,seg)=>{const m=malla(new T.CylinderGeometry(rt,rb,h,seg||14),mat);m.position.set(x,y,z);(padre||scene).add(m);return m;};

      // cámara de vigilancia
      const blanco=std({color:0xe9edf3,roughness:.35,metalness:.3}),negro=std({color:0x07090d,roughness:.15,metalness:.8});
      const conoMat=new T.MeshBasicMaterial({color:0x8fb8ff,transparent:true,opacity:.028,depthWrite:false,blending:T.AdditiveBlending,side:T.DoubleSide});
      function camara(pos,dx,dz,poste){
        const g=new T.Group();g.position.copy(pos);const yaw=Math.atan2(dx,dz);g.rotation.y=yaw;scene.add(g);
        if(poste){cil(.14,.2,pos.y,grisOsc,0,-pos.y/2,0,g);caja(.5,.2,.5,grisOsc,0,-pos.y+.1,0,g);}
        else caja(.35,.55,.25,gris,0,0,-.25,g);
        caja(.14,.14,.7,gris,0,0,.15,g);
        const p=new T.Group();p.position.set(0,-.12,.55);p.rotation.x=.5;g.add(p);
        caja(.55,.45,1.15,blanco,0,0,0,p);caja(.68,.07,1.35,blanco,0,.27,.05,p);
        const lente=cil(.17,.17,.12,negro,0,0,.6,p,18);lente.rotation.x=Math.PI/2;
        const ojo=new T.Mesh(new T.CircleGeometry(.1,18),new T.MeshBasicMaterial({color:0x2a5cff}));ojo.position.set(0,0,.67);p.add(ojo);
        const led=new T.Mesh(new T.SphereGeometry(.06,8,8),new T.MeshBasicMaterial({color:0xff2b3a}));led.position.set(.2,.13,.58);p.add(led);anim.leds.push(led);
        const cg=new T.ConeGeometry(3.6,9,28,1,true);cg.translate(0,-4.5,0);
        const cono=new T.Mesh(cg,conoMat);cono.rotation.x=-Math.PI/2;p.add(cono);
        anim.camaras.push({g,yaw,fase:r()*6});
      }

      // edificios
      const etiquetas=[];
      function edificio(b){
        const w=b.w,d=b.d*.7,cx=b.x+b.w/2-50,cz=(b.y+b.d/2-50)*.7,h=b.h;
        const lado=fachada(b.tipo,d,h),frente=fachada(b.tipo,w,h),arriba=techo(b.tipo,w,d);
        const m=malla(new T.BoxGeometry(w,h,d),[lado,lado,arriba,grisOsc,frente,frente]);m.position.set(cx,h/2,cz);scene.add(m);
        const pm=std({color:0x3c4559,roughness:.8});
        if(b.tipo==="torre"||b.tipo==="garita"){const t=.35,ph=b.tipo==="torre"?1:.4;
          caja(w,ph,t,pm,cx,h+ph/2,cz-d/2+t/2);caja(w,ph,t,pm,cx,h+ph/2,cz+d/2-t/2);caja(t,ph,d,pm,cx-w/2+t/2,h+ph/2,cz);caja(t,ph,d,pm,cx+w/2-t/2,h+ph/2,cz);}
        (b.equipos||[]).forEach(([ox,oz,ew,eh,ed])=>{const u=caja(ew,eh,ed,std({color:0x8a93a5,roughness:.5,metalness:.6}),cx-w/2+ox,h+eh/2,cz-d/2+oz);
          const f=cil(Math.min(ew,ed)*.32,Math.min(ew,ed)*.32,.12,negro,0,eh/2+.05,0,u,20);});
        if(b.tanque){const t=cil(1.4,1.4,2.6,std({color:0x7c8699,metalness:.6,roughness:.4}),cx+w/2-3,h+2.6/2+.6,cz-d/2+3);}
        if(b.toldo) caja(w*.7,.25,2.2,std({color:0x2a3142,roughness:.6}),cx,h*.72,cz+d/2+1.1);
        const o=.35,yc=Math.min(h-1,b.camAltura||h-1.2);
        [[1,1],[1,-1],[-1,1],[-1,-1]].forEach(([sx,sz])=>{if(b.camaras&&!b.camaras.includes(sx+","+sz)) return;
          camara(new T.Vector3(cx+sx*(w/2+o),yc,cz+sz*(d/2+o)),sx,sz);});
        etiquetas.push({txt:b.nombre,p:new T.Vector3(cx,h+(b.tipo==="torre"?5:3),cz)});
      }
      [
        {nombre:"Almacén A",tipo:"nave",x:8,y:14,w:30,d:32,h:11,equipos:[[22,4,3,1.6,2.4],[8,13,2.4,1.2,2]]},
        {nombre:"Oficinas",tipo:"torre",x:57,y:12,w:31,d:24,h:28,equipos:[[4,4,4,2,3],[10,4,3,1.6,3],[5,11,3.5,2,2.5]],tanque:true},
        {nombre:"Taller",tipo:"taller",x:60,y:52,w:26,d:18,h:8,equipos:[[4,3,2.6,1.2,2]]},
        {nombre:"Garita",tipo:"garita",x:55,y:82,w:8,d:9,h:3.8,camaras:["-1,1"],camAltura:3.4,toldo:true}
      ].forEach(edificio);
      [[8,60,-1,1],[38,88,1,1],[52,94,1,1],[97,8,1,-1]].forEach(([x,y,dx,dz])=>camara(A(x,y,6.5),dx,dz,true));

      // coches
      function auto(x,z,rot,color,patrulla){
        const g=new T.Group();g.position.set(x,0,z);g.rotation.y=rot;scene.add(g);
        const pint=std({color,roughness:.28,metalness:.75}),vidrio=std({color:0x0b1220,roughness:.08,metalness:.9});
        caja(1.9,.62,4.4,pint,0,.62,0,g);caja(1.86,.18,4.3,grisOsc,0,.28,0,g);
        caja(1.62,.58,2.3,vidrio,0,1.2,-.25,g);caja(1.56,.07,2.0,pint,0,1.52,-.3,g);
        const rueda=std({color:0x0c0e12,roughness:.85});
        [[.92,1.38],[-.92,1.38],[.92,-1.38],[-.92,-1.38]].forEach(([wx,wz])=>{const w=cil(.36,.36,.28,rueda,wx,.36,wz,g,18);w.rotation.z=Math.PI/2;});
        const faro=new T.MeshBasicMaterial({color:0xfff2d2}),cola=new T.MeshBasicMaterial({color:0xff2a2a});
        [.62,-.62].forEach(fx=>{caja(.42,.14,.06,faro,fx,.78,2.21,g).castShadow=false;caja(.42,.12,.06,cola,fx,.78,-2.21,g).castShadow=false;});
        if(patrulla){const a=new T.Mesh(new T.BoxGeometry(.55,.16,.32),new T.MeshBasicMaterial({color:0xffb020})),b=new T.Mesh(new T.BoxGeometry(.55,.16,.32),new T.MeshBasicMaterial({color:0x3d7bff}));
          a.position.set(.3,1.64,-.3);b.position.set(-.3,1.64,-.3);g.add(a,b);anim.barras.push(a,b);
          const haz=new T.SpotLight(0xfff0d0,1.4,26,.5,.6,1.5);haz.position.set(0,.9,2.3);haz.target.position.set(0,0,10);g.add(haz,haz.target);}
        return g;}
      const COL=[0xdfe5ef,0x24324f,0x8e1d2b,0x5d6576,0x15181f,0xb88a2a,0x3c5d7a];
      [[13,68,0],[19,68,0],[31,68,0],[37,68,0],[13,82,Math.PI],[25,82,Math.PI],[31,82,Math.PI],[90,30,Math.PI/2]].forEach(([x,y,rt])=>{const p=A(x,y);auto(p.x,p.z,rt+(r()-.5)*.08,COL[(r()*COL.length)|0]);});
      function pickup(color){
        const g=new T.Group();scene.add(g);
        const pint=std({color,roughness:.3,metalness:.6}),vid=std({color:0x0a111d,roughness:.06,metalness:.9}),neg=std({color:0x1a1f29,roughness:.7});
        caja(2.1,.75,5.6,pint,0,.85,0,g);caja(2.05,.26,5.5,neg,0,.38,0,g);
        caja(2.0,.85,2.1,pint,0,1.62,.75,g);caja(1.92,.62,2.0,vid,0,1.66,.78,g);caja(2.02,.08,2.12,pint,0,2.07,.75,g);
        caja(1.9,.2,2.6,neg,0,1.25,-1.45,g);
        caja(.12,.5,2.7,pint,.99,1.45,-1.45,g);caja(.12,.5,2.7,pint,-.99,1.45,-1.45,g);caja(2.1,.5,.12,pint,0,1.45,-2.75,g);
        caja(2.14,.14,5.62,std({color:0xff8a00,roughness:.4,emissive:0x331800}),0,1.0,0,g);
        caja(2.2,.3,.3,neg,0,.6,2.82,g);caja(2.2,.25,.25,neg,0,.6,-2.82,g);
        const rueda=std({color:0x0c0e12,roughness:.85}),rin=std({color:0x9aa3b2,metalness:.8,roughness:.3});
        [[1.02,1.75],[-1.02,1.75],[1.02,-1.75],[-1.02,-1.75]].forEach(([wx,wz])=>{const w=cil(.48,.48,.36,rueda,wx,.48,wz,g,20);w.rotation.z=Math.PI/2;const rr=cil(.26,.26,.38,rin,wx,.48,wz,g,12);rr.rotation.z=Math.PI/2;});
        const faro=new T.MeshBasicMaterial({color:0xfff2d2}),cola=new T.MeshBasicMaterial({color:0xff2a2a});
        [.7,-.7].forEach(fx=>{caja(.5,.16,.06,faro,fx,1.05,2.81,g).castShadow=false;caja(.2,.4,.06,cola,fx*1.3,1.3,-2.82,g).castShadow=false;});
        caja(1.6,.1,.4,neg,0,2.15,.6,g);
        const a=new T.Mesh(new T.BoxGeometry(.72,.17,.34),new T.MeshBasicMaterial({color:0xff8a00})),b=new T.Mesh(new T.BoxGeometry(.72,.17,.34),new T.MeshBasicMaterial({color:0xffb020}));
        a.position.set(.38,2.28,.6);b.position.set(-.38,2.28,.6);g.add(a,b);anim.barras.push(a,b);
        const haz=new T.SpotLight(0xfff0d0,1.4,26,.5,.6,1.5);haz.position.set(0,1,2.9);haz.target.position.set(0,0,11);g.add(haz,haz.target);
        const lz=new T.PointLight(0xff8a00,.9,12,2);lz.position.set(0,2.6,.6);g.add(lz);
        return g;}
      if(SUP){const patrulla={g:pickup(0xeef1f6),ruta:SUP.ruta,v:SUP.velocidad,d:0,rumbo:0};preparaRuta(patrulla);anim.patrulla=patrulla;
        const e=document.createElement("div");e.className="cg-r3d-v cg-r3d-sup";e.style.setProperty("--c","#ff8a00");e.innerHTML=`<b>${SUP.etiqueta}</b><s></s>`;capa.appendChild(e);patrulla.etq=e;}


      // árboles
      const tronco=std({color:0x4a3526,roughness:.9});
      const hojas=[0x2f5a37,0x3a6b40,0x264d30,0x47774a].map(c=>std({color:c,roughness:.85,flatShading:true}));
      [[13,51],[31,51],[54,7],[92,8],[94,31],[30,93],[40,93],[82,93],[5,30],[5,44],[64,93],[95,88],[20,8],[35,8]].forEach(([x,y])=>{
        const g=new T.Group(),p=A(x,y);g.position.copy(p);const s=.85+r()*.5;g.scale.set(s,s,s);scene.add(g);
        cil(.16,.24,2,tronco,0,1,0,g,8);
        for(let i=0;i<3;i++){const m=malla(new T.IcosahedronGeometry(1.1+r()*.6,1),hojas[(r()*4)|0]);m.position.set((r()-.5)*1,2.4+i*.55,(r()-.5)*1);g.add(m);}
      });

      // farolas
      [[44,20],[44,70],[60,47],[20,57],[80,47],[52,88]].forEach(([x,y],i)=>{const p=A(x,y),g=new T.Group();g.position.copy(p);scene.add(g);
        cil(.09,.13,6.5,grisOsc,0,3.25,0,g,10);caja(1.6,.1,.12,grisOsc,.8,6.45,0,g);
        const cab=new T.Mesh(new T.BoxGeometry(.7,.18,.4),new T.MeshBasicMaterial({color:0xffe6b8}));cab.position.set(1.5,6.35,0);g.add(cab);
        if(i<4){const l=new T.PointLight(0xffd59a,1.1,20,2);l.position.set(1.5,6,0);g.add(l);}});

      // valla perimetral y pluma de acceso
      {const valla=std({color:0x3a4356,roughness:.6,metalness:.6}),red=new T.MeshStandardMaterial({color:0x9fb3d9,transparent:true,opacity:.13,side:T.DoubleSide,depthWrite:false});
        const tramo=(x1,y1,x2,y2)=>{const a=A(x1,y1),b=A(x2,y2),L=a.distanceTo(b),mid=a.clone().add(b).multiplyScalar(.5),ang=Math.atan2(b.x-a.x,b.z-a.z);
          const rr=new T.Mesh(new T.PlaneGeometry(L,2),red);rr.position.set(mid.x,1.1,mid.z);rr.rotation.y=ang+Math.PI/2;scene.add(rr);
          const top=malla(new T.BoxGeometry(L,.06,.06),valla);top.position.set(mid.x,2.15,mid.z);top.rotation.y=ang+Math.PI/2;scene.add(top);
          const n=Math.max(1,Math.round(L/3.2));for(let i=0;i<=n;i++){const p=a.clone().lerp(b,i/n);cil(.06,.06,2.3,valla,p.x,1.15,p.z,null,6);}};
        tramo(3,4,97,4);tramo(97,4,97,96);tramo(3,96,3,4);tramo(3,96,44,96);tramo(52,96,97,96);
        const c=document.createElement("canvas");c.width=256;c.height=16;const g=c.getContext("2d");for(let i=0;i<8;i++){g.fillStyle=i%2?"#f2f2f2":"#d4232f";g.fillRect(i*32,0,32,16);}
        const pa=A(44,96);caja(.5,1.2,.5,valla,pa.x,.6,pa.z);
        const bis=new T.Group();bis.position.set(pa.x,1.1,pa.z);scene.add(bis);const pluma=malla(new T.BoxGeometry(5.6,.18,.18),std({map:tex(c),roughness:.5}));pluma.position.set(2.9,0,0);bis.add(pluma);anim.pluma=bis;}

      // puntos de control
      PCS.forEach(p=>{const pos=A(p.x,p.y);const g=new T.Group();g.position.copy(pos);scene.add(g);
        cil(.07,.07,1.3,grisOsc,0,.65,0,g,8);
        p.placa=new T.MeshBasicMaterial({color:0x8fb8ff});const pl=new T.Mesh(new T.BoxGeometry(.6,.6,.08),p.placa);pl.position.y=1.45;g.add(pl);
        p.disco=new T.MeshBasicMaterial({color:0x8fb8ff,transparent:true,opacity:.35,depthWrite:false});
        const ds=new T.Mesh(new T.RingGeometry(.8,1.05,40),p.disco);ds.rotation.x=-Math.PI/2;ds.position.y=.04;g.add(ds);
        p.pulsoMat=new T.MeshBasicMaterial({color:0x4ade80,transparent:true,opacity:0,depthWrite:false});
        p.pulso=new T.Mesh(new T.RingGeometry(.9,1.2,40),p.pulsoMat);p.pulso.rotation.x=-Math.PI/2;p.pulso.position.y=.05;g.add(p.pulso);p.t=-9;p.ultimo={};});

      // vigilantes
      VIGS.forEach(v=>{preparaRuta(v);
        const pts=v.ruta.concat([v.ruta[0]]).map(([x,y])=>A(x,y,.07));
        const ln=new T.Line(new T.BufferGeometry().setFromPoints(pts),new T.LineDashedMaterial({color:v.c,dashSize:1.4,gapSize:1,transparent:true,opacity:.7}));ln.computeLineDistances();scene.add(ln);
        const g=new T.Group();scene.add(g);const s=2.1;
        const cuerpo=new T.Group();cuerpo.scale.set(s,s,s);g.add(cuerpo);
        const unif=std({color:0x1d273a,roughness:.7}),piel=std({color:0xc89878,roughness:.6}),chaleco=std({color:v.c,emissive:new T.Color(v.c),emissiveIntensity:.55,roughness:.4});
        const pi=cil(.11,.1,.85,unif,.13,.43,0,cuerpo,8),pd=cil(.11,.1,.85,unif,-.13,.43,0,cuerpo,8);
        cil(.3,.25,.8,unif,0,1.25,0,cuerpo,12);cil(.32,.32,.12,chaleco,0,1.38,0,cuerpo,12);cil(.32,.3,.08,chaleco,0,1.12,0,cuerpo,12);
        const s1=malla(new T.SphereGeometry(.19,14,12),piel);s1.position.y=1.85;cuerpo.add(s1);
        cil(.2,.21,.1,unif,0,2.0,0,cuerpo,14);caja(.2,.03,.16,unif,0,1.96,.2,cuerpo);
        const aro=new T.Mesh(new T.RingGeometry(.9,1.35,40),new T.MeshBasicMaterial({color:v.c,transparent:true,opacity:.55,depthWrite:false,blending:T.AdditiveBlending}));aro.rotation.x=-Math.PI/2;aro.position.y=.06;g.add(aro);
        const luz=new T.PointLight(new T.Color(v.c),.8,7,2);luz.position.y=1.5;g.add(luz);
        v.g=g;v.piernas=[pi,pd];v.cuerpo=cuerpo;
        const e=document.createElement("div");e.className="cg-r3d-v";e.style.setProperty("--c",v.c);e.innerHTML=`<b>${v.id}</b><s></s>`;capa.appendChild(e);v.etq=e;
        anim.vigs.push(v);});
      etiquetas.forEach(t=>{const e=document.createElement("div");e.className="cg-r3d-e";e.textContent=t.txt;capa.appendChild(e);t.el=e;});
      anim.etiquetas=etiquetas;
      fotograma.ini=performance.now();fotograma.prev=fotograma.ini;
      raf=requestAnimationFrame(fotograma);
    }

    const hechos=new Set();let segundo=-1,mx=0;
    const alMover=e=>{const b=contenedor.getBoundingClientRect();mx=((e.clientX-b.left)/b.width-.5);};
    contenedor.addEventListener("pointermove",alMover);
    function avisar(v,p,ahora){
      p.placa.color.set(0x4ade80);p.disco.color.set(0x4ade80);p.t=ahora;
      hechos.add(p.n);
      opciones.onPunto?.({vigilante:{id:v.id,nombre:v.nombre,color:v.c},punto:p.n,hechos:hechos.size,total:PCS.length});
      if(hechos.size===PCS.length) setTimeout(()=>{if(parado) return;hechos.clear();PCS.forEach(q=>{q.placa.color.set(0x8fb8ff);q.disco.color.set(0x8fb8ff);});opciones.onReinicio?.({total:PCS.length});},2500);
    }
    const proy=new T.Vector3();
    function aPantalla(v3,el,W,H){proy.copy(v3).project(cam);
      if(proy.z>1){el.style.display="none";return;}el.style.display="";
      el.style.transform=`translate(${(proy.x+1)/2*W}px,${(1-proy.y)/2*H}px) translate(-50%,-100%)`;}
    function fotograma(ahora){
      if(parado) return;
      if(!visible){raf=requestAnimationFrame(fotograma);return;}
      const dt=Math.max(0,Math.min(.05,(ahora-fotograma.prev)/1000));fotograma.prev=ahora;
      const t=(ahora-fotograma.ini)/1000,W=contenedor.clientWidth,H=contenedor.clientHeight;
      const ang=.8+Math.sin(t*.07)*.18+mx*.22,R=136;
      cam.position.set(Math.sin(ang)*R,102,Math.cos(ang)*R);cam.lookAt(0,-6,1);
      anim.leds.forEach((l,i)=>l.visible=((t*1.4+i*.37)%1)<.5);
      anim.camaras.forEach(c=>c.g.rotation.y=c.yaw+Math.sin(t*.45+c.fase)*.45);
      anim.barras.forEach((b,i)=>b.visible=((t*2.2+(i%2)*.5)%1)<.5);
      const pa=anim.patrulla;if(pa){pa.d+=pa.v*dt;
      const [px,py]=posicion(pa,pa.d),[qx,qy]=posicion(pa,pa.d+1.5);
      const P=A(px,py),Q=A(qx,qy);{const dx=Q.x-P.x,dz=Q.z-P.z,l=Math.hypot(dx,dz)||1,obj=new T.Vector3(P.x-dz/l*1.5,0,P.z+dx/l*1.5);if(!pa.puesto){pa.g.position.copy(obj);pa.puesto=1;}pa.g.position.lerp(obj,Math.min(1,dt*2.5));if(l>.01) pa.rumbo=Math.atan2(dx,dz);let dr=pa.rumbo-pa.g.rotation.y;dr=Math.atan2(Math.sin(dr),Math.cos(dr));pa.g.rotation.y+=dr*Math.min(1,dt*2.2);}aPantalla(pa.g.position.clone().setY(7.5),pa.etq,W,H);}
      for(const v of anim.vigs){
        v.d+=v.v*dt;const [x,y]=posicion(v,v.d),[x2,y2]=posicion(v,v.d+.4);
        const p=A(x,y),q=A(x2,y2);v.g.position.copy(p);if(q.distanceTo(p)>.01) v.cuerpo.rotation.y=Math.atan2(q.x-p.x,q.z-p.z);
        const paso=Math.sin(t*9+v.d);v.piernas[0].rotation.x=paso*.45;v.piernas[1].rotation.x=-paso*.45;v.cuerpo.position.y=Math.abs(paso)*.06;
        for(const c of PCS){if(Math.hypot(c.x-x,c.y-y)<1.6&&(ahora-(c.ultimo[v.id]||-1e9))>6000){c.ultimo[v.id]=ahora;avisar(v,c,ahora);}}
        aPantalla(p.clone().setY(4.6),v.etq,W,H);
      }
      PCS.forEach(c=>{const k=(ahora-c.t)/1200;if(k>=0&&k<1){c.pulso.scale.setScalar(1+k*3.5);c.pulsoMat.opacity=.9*(1-k);}else c.pulsoMat.opacity=0;});
      anim.etiquetas.forEach(e=>aPantalla(e.p,e.el,W,H));
      const s=Math.floor(t);if(s!==segundo){segundo=s;opciones.onSegundo?.(s);}
      renderer.render(scene,cam);
      if(!quieto) raf=requestAnimationFrame(fotograma);
    }
    const ro=new ResizeObserver(()=>{const W=contenedor.clientWidth,H=contenedor.clientHeight;
      if(!iniciado){iniciar();return;}
      if(W>0&&H>0){renderer.setSize(W,H,false);cam.aspect=W/H;cam.updateProjectionMatrix();}});
    ro.observe(contenedor);
    const io="IntersectionObserver" in window?new IntersectionObserver(es=>{visible=es[0].isIntersecting;}):null;
    io?.observe(contenedor);

    return {
      destruir(){
        parado=true;cancelAnimationFrame(raf);ro.disconnect();io?.disconnect();
        contenedor.removeEventListener("pointermove",alMover);
        if(scene) scene.traverse(o=>{o.geometry?.dispose?.();const m=o.material;(Array.isArray(m)?m:m?[m]:[]).forEach(x=>{x.map?.dispose?.();x.emissiveMap?.dispose?.();x.dispose?.();});});
        renderer?.dispose();lienzo.remove();capa.remove();contenedor.classList.remove("cg-r3d");
      },
    };
}
