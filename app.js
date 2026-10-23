/* Obra · Velderrain Arquitectos — app de obra
   Tres papeles: director (Fernando), residente (Raúl), tesoreria (Fanny).
   Todo se guarda en las hojas de Google a través del Apps Script. */
(() => {
'use strict';
const CFG = window.OBRA_CONFIG || {};
const $app = document.getElementById('app');
const $modal = document.getElementById('modal');
const $toast = document.getElementById('toast');

const S = { token: null, yo: null, inicio: null, ruta: 'inicio', params: {}, cache: {} };

// ---------- utilidades ----------
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const mxn = n => '$' + Number(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const mxn0 = n => '$' + Math.round(Number(n || 0)).toLocaleString('es-MX');
const num = n => Number(n || 0).toLocaleString('es-MX', { maximumFractionDigits: 2 });
const pct = n => Math.round(Number(n || 0) * 100) + '%';
const ini = s => String(s || '?').trim().charAt(0).toUpperCase();
function toast(msg, bad) {
  $toast.textContent = msg; $toast.className = 'on' + (bad ? ' bad' : '');
  clearTimeout(toast.t); toast.t = setTimeout(() => $toast.className = '', bad ? 4500 : 2600);
}
function cargando(on) {
  let el = document.querySelector('.loading');
  if (on && !el) { el = document.createElement('div'); el.className = 'loading'; document.body.appendChild(el); }
  if (!on && el) el.remove();
}
const saludo = () => { const h = new Date().getHours(); return h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches'; };

// ---------- sesión con Google ----------
function payload(t) {
  try { return JSON.parse(decodeURIComponent(escape(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))))); }
  catch { return null; }
}
function tokenVivo(t) { const p = t && payload(t); return p && p.exp * 1000 > Date.now() + 60000; }
function guardarToken(t) { S.token = t; try { localStorage.setItem('obra_tk', t); } catch {} }
function leerToken() { try { return localStorage.getItem('obra_tk'); } catch { return null; } }
function salir() {
  try { localStorage.removeItem('obra_tk'); } catch {}
  S.token = null; S.yo = null;
  if (window.google?.accounts?.id) google.accounts.id.disableAutoSelect();
  pantallaLogin();
}

let gisListo = null;
function esperarGIS() {
  if (gisListo) return gisListo;
  gisListo = new Promise((ok, no) => {
    let n = 0;
    const t = setInterval(() => {
      if (window.google?.accounts?.id) {
        clearInterval(t);
        google.accounts.id.initialize({
          client_id: CFG.clientId, auto_select: true, use_fedcm_for_prompt: true,
          callback: r => { guardarToken(r.credential); arrancar(); }
        });
        ok();
      } else if (++n > 100) { clearInterval(t); no(new Error('No cargó Google')); }
    }, 100);
  });
  return gisListo;
}

function pantallaLogin(err) {
  $app.innerHTML = `<div class="login"><div class="box">
    <img src="img/logo-horizontal.png" alt="Velderrain Arquitectos">
    <div class="bar"></div>
    <p>Control de obra</p>
    <div class="gbtn" id="gbtn"></div>
    ${err ? `<div class="err">${esc(err)}</div>` : ''}
  </div></div>`;
  esperarGIS().then(() => {
    google.accounts.id.renderButton(document.getElementById('gbtn'),
      { theme: 'filled_blue', size: 'large', shape: 'pill', text: 'continue_with', locale: 'es', width: 280 });
    google.accounts.id.prompt();
  }).catch(() => toast('No se pudo cargar Google. Revisa la señal.', true));
}

// ---------- API ----------
async function api(accion, datos) {
  if (!CFG.apiUrl) throw new Error('Falta conectar la app con las hojas (apiUrl).');
  if (!tokenVivo(S.token)) { pantallaLogin('Tu sesión venció. Entra de nuevo.'); throw new Error('Sesión vencida'); }
  cargando(true);
  try {
    const r = await fetch(CFG.apiUrl, { method: 'POST', body: JSON.stringify({ token: S.token, accion, datos }) });
    const j = await r.json();
    if (!j.ok) {
      if (j.auth) { pantallaLogin(j.error); }
      throw new Error(j.error);
    }
    return j.data;
  } catch (e) {
    if (e instanceof TypeError) throw new Error('Sin conexión. Intenta otra vez.');
    throw e;
  } finally { cargando(false); }
}

// ---------- modal ----------
function abrirModal(html) {
  $modal.innerHTML = `<div class="sheet" role="dialog" aria-modal="true">${html}</div>`;
  $modal.hidden = false;
  $modal.onclick = e => { if (e.target === $modal) cerrarModal(); };
  return $modal.querySelector('.sheet');
}
function cerrarModal() { $modal.hidden = true; $modal.innerHTML = ''; }
function confirmar(titulo, cuerpo, si = 'Sí, confirmar', peligro) {
  return new Promise(res => {
    const sh = abrirModal(`<h3>${esc(titulo)}</h3><div class="mut" style="margin-top:6px">${cuerpo}</div>
      <div class="acts"><button class="btn sec grow" data-x="no">Cancelar</button>
      <button class="btn ${peligro ? 'danger' : 'pri'} grow" data-x="si">${esc(si)}</button></div>`);
    sh.querySelector('[data-x=no]').onclick = () => { cerrarModal(); res(false); };
    sh.querySelector('[data-x=si]').onclick = () => { cerrarModal(); res(true); };
  });
}

// ---------- marco ----------
const NAVS = {
  director: [['inicio', '🏠', 'Inicio'], ['estimaciones', '📋', 'Destajos'], ['hitos', '🏗️', 'Subcontratos'], ['fanny', '💵', 'Pagos'], ['mas', '☰', 'Más']],
  residente: [['inicio', '🏠', 'Inicio'], ['hitos', '🏗️', 'Subcontratos']],
  tesoreria: [['inicio', '💵', 'Pagos']]
};
function marco(titulo, sub, cuerpo, { back, acciones } = {}) {
  const nav = NAVS[S.yo.rol] || [];
  const dots = contadores();
  $app.innerHTML = `
  <header class="top">
    ${back ? `<button class="back" aria-label="Regresar" id="bk">‹</button>` : `<img src="img/icon-192.png" alt="">`}
    <div class="t"><b>${esc(titulo)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</div>
    <button class="av" id="av" aria-label="Mi cuenta">${esc(ini(S.yo.nombre))}</button>
  </header>
  ${S.real ? `<div id="vbar" style="background:var(--orange);color:#fff;font-size:13px;font-weight:600;padding:8px 16px;display:flex;justify-content:space-between;align-items:center;position:sticky;top:calc(52px + var(--safe-t));z-index:19">👁 Viendo como ${esc(S.yo.nombre)}<button style="background:#fff;color:var(--orange-2);border:0;border-radius:8px;padding:5px 10px;font-weight:700;cursor:pointer" id="vsal">Volver a mí</button></div>` : ''}
  <main id="main">${cuerpo}</main>
  ${acciones ? `<div class="actbar">${acciones}</div>` : ''}
  ${nav.length > 1 ? `<nav class="nav">${nav.map(([r, i, l]) =>
    `<button data-r="${r}" class="${S.ruta === r || (S.params.de === r) ? 'on' : ''}"><span class="i">${i}</span>${l}${dots[r] ? `<span class="dot">${dots[r]}</span>` : ''}</button>`).join('')}</nav>` : ''}`;
  $app.querySelectorAll('.nav button').forEach(b => b.onclick = () => ir(b.dataset.r));
  const bk = document.getElementById('bk'); if (bk) bk.onclick = () => history.back();
  document.getElementById('av').onclick = cuenta;
  const vs = document.getElementById('vsal'); if (vs) vs.onclick = () => verComo('director');
  window.scrollTo(0, 0);
}
function contadores() {
  const I = S.inicio; if (!I) return {};
  const d = {};
  const env = (I.hojas || []).filter(h => h.enviado).length;
  if (S.yo.rol === 'director') {
    if (env) d.estimaciones = env;
    if (I.hitosPorAutorizar?.length) d.hitos = I.hitosPorAutorizar.length;
    if (I.fanny?.lista?.length) d.fanny = I.fanny.lista.length;
    if (I.gastos?.length) d.mas = I.gastos.length;
  }
  return d;
}
function cuenta() {
  const real = S.real || S.yo;
  const vista = !!S.real;
  const sh = abrirModal(`<div class="row"><div style="width:44px;height:44px;border-radius:50%;background:var(--orange);color:#fff;display:grid;place-items:center;font-weight:700;font-size:18px">${esc(ini(real.nombre))}</div>
    <div class="grow"><div class="ttl">${esc(real.nombre)}</div><div class="mut">${esc(real.email)} · ${esc(rolTxt(real.rol))}</div></div></div>
    ${real.rol === 'director' ? `<h2 style="margin-top:18px">Ver la app como…</h2>
      <div class="seg" id="vc">
        <button data-r="director" class="${!vista ? 'on' : ''}">Yo</button>
        <button data-r="residente" class="${vista && S.yo.rol === 'residente' ? 'on' : ''}">Raúl</button>
        <button data-r="tesoreria" class="${vista && S.yo.rol === 'tesoreria' ? 'on' : ''}">Fanny</button>
      </div>
      <div class="mut" style="font-size:12.5px;margin-top:8px">Ves exactamente su pantalla. Ojo: lo que guardes o envíes ahí es real y queda a tu nombre en la bitácora.</div>` : ''}
    <div class="acts"><button class="btn sec grow" id="c1">Cerrar</button><button class="btn danger grow" id="c2">Salir</button></div>`);
  sh.querySelectorAll('#vc button').forEach(b => b.onclick = () => { cerrarModal(); verComo(b.dataset.r); });
  sh.querySelector('#c1').onclick = cerrarModal;
  sh.querySelector('#c2').onclick = () => { cerrarModal(); salir(); };
}
function verComo(rol) {
  const real = S.real || S.yo;
  if (rol === 'director') { S.yo = real; S.real = null; }
  else { S.real = real; S.yo = { ...real, rol, nombre: rol === 'residente' ? 'Raúl' : 'Fanny' }; }
  S.inicio = null;
  ir('inicio', {}, true);
}
const rolTxt = r => ({ director: 'Director', residente: 'Residente', tesoreria: 'Tesorería' }[r] || r);

// ---------- rutas ----------
function ir(ruta, params = {}, reemplazar) {
  S.ruta = ruta; S.params = params;
  const st = { ruta, params };
  reemplazar ? history.replaceState(st, '') : history.pushState(st, '');
  pintar();
}
window.addEventListener('popstate', e => {
  if (!$modal.hidden) { cerrarModal(); }
  const st = e.state || { ruta: 'inicio', params: {} };
  S.ruta = st.ruta; S.params = st.params || {}; pintar();
});
async function pintar() {
  if (!S.yo) return;
  const v = VISTAS[S.ruta] || VISTAS.inicio;
  try { await v(S.params); }
  catch (e) { toast(e.message, true); }
}
async function refrescarInicio() { S.inicio = await api('inicio'); return S.inicio; }

// ---------- vistas ----------
const VISTAS = {};

VISTAS.inicio = async () => {
  if (!S.inicio) marco('Obra VA', '', `<div class="empty"><div class="spin" style="margin:30px auto"></div></div>`);
  const I = await refrescarInicio();
  if (S.yo.rol === 'tesoreria') return vistaFanny(I.fanny);
  if (S.yo.rol === 'residente') return inicioResidente(I);
  return inicioDirector(I);
};

function inicioDirector(I) {
  const env = I.hojas.filter(h => h.enviado);
  const fan = I.fanny || { lista: [], efectivo: 0 };
  const conFanny = fan.lista.reduce((a, x) => a + x.importe, 0);
  const hit = I.hitosPorAutorizar || [];
  const tile = (cls, n, l, r) => `<div class="tile ${cls} ${n ? '' : 'zero'}" data-go="${r}"><div class="n">${n}</div><div class="l">${l}</div></div>`;
  let h = `<div class="hello">${saludo()}, ${esc(S.yo.nombre)}</div>
  <p class="sub">${env.length || hit.length || (I.gastos || []).some(g => g.porAprobar) ? 'Tienes cosas por autorizar.' : 'Todo al corriente.'}</p>
  <div class="tiles">
    ${tile('or', env.length, 'Estimaciones por autorizar', 'estimaciones')}
    ${tile('or', hit.length, 'Hitos de subcontrato por pagar', 'hitos')}
    ${tile('bl', mxn0(conFanny), `Con Fanny sin pagar (${fan.lista.length})`, 'fanny')}
    ${tile('ok', mxn0(fan.efectivo), 'Efectivo a llevar hoy', 'fanny')}
    ${tile('bl', mxn0(fan.fiscal || 0), 'Cuenta fiscal a cubrir hoy', 'fanny')}
    ${fan.caja != null ? tile('ok', mxn0(fan.caja), `En caja de Fanny · después de pagar ${mxn0(fan.caja - conFanny)}`, 'fanny') : ''}
    ${tile('or', (I.gastos || []).length, `Gastos directos por revisar${(I.gastos || []).some(g => g.porAprobar) ? ' (hay por aprobar)' : ''}`, 'gastos')}
    <div class="tile bl" data-go="gasto"><div class="n">＋</div><div class="l">Registrar un gasto</div></div>
  </div>`;
  if (env.length) {
    h += `<h2>Raúl ya envió</h2>` + env.map(cardHoja).join('');
  }
  if (hit.length) {
    h += `<h2>Hitos cumplidos por pagar</h2>` + hit.map(x => `<div class="card tap" data-go="hitos"><div class="row"><div class="grow">
      <div class="ttl">${esc(x.proveedor || x.codigo)}</div><div class="mut">${esc(x.hito)} · ${pct(x.pctPago)}</div></div>
      <div class="amt">${mxn(x.monto)}</div></div></div>`).join('');
  }
  h += `<h2>Obras</h2>` + resumenObras(I.hojas);
  marco('Obra VA', 'Velderrain Arquitectos', h);
  enlazar();
}

function resumenObras(hojas) {
  const obras = {};
  hojas.forEach(x => { (obras[x.obra] = obras[x.obra] || []).push(x); });
  return Object.entries(obras).map(([o, hs]) => {
    const pagado = hs.reduce((a, x) => a + x.pagado, 0);
    const av = hs.reduce((a, x) => a + x.avance, 0) / hs.length;
    return `<div class="card tap" data-go="estimaciones" data-obra="${esc(o)}">
      <div class="row"><div class="grow"><div class="ttl">${esc(o)}</div>
      <div class="mut">${hs.length} destajo${hs.length > 1 ? 's' : ''} · pagado ${mxn0(pagado)}</div></div>
      <div class="amt">${pct(av)}</div></div><div class="prog"><i style="width:${Math.min(av * 100, 100)}%"></i></div></div>`;
  }).join('');
}

function estadoHoja(x) {
  if (x.enviado) return `<span class="chip or">📨 Enviada ${esc((x.fechaEnvio || '').slice(0, 5))}</span>`;
  if (x.esperandoFanny > 0) return `<span class="chip bl">Con Fanny</span>`;
  return `<span class="chip gr">En captura</span>`;
}
function cardHoja(x) {
  return `<div class="card tap" data-go="${S.yo.rol === 'director' ? 'detalle' : 'captura'}" data-tab="${esc(x.tab)}">
    <div class="row"><div class="grow"><div class="ttl">${esc(x.contratista)}</div>
    <div class="mut">${esc(x.tab)} · ${esc(x.folio)}</div></div>${estadoHoja(x)}</div>
    <div class="row" style="margin-top:8px"><div class="grow mut">Esta estimación</div><div class="amt">${mxn(x.estaEstimacion)}</div></div>
    <div class="prog"><i style="width:${Math.min(x.avance * 100, 100)}%"></i></div>
    <div class="mut" style="margin-top:4px;font-size:12px">Avance ${pct(x.avance)} · Pagado ${mxn0(x.pagado)}</div></div>`;
}

function inicioResidente(I) {
  const pend = I.hojas.filter(h => !h.enviado);
  const env = I.hojas.filter(h => h.enviado);
  let h = `<div class="hello">${saludo()}, ${esc(S.yo.nombre)}</div>
  <p class="sub">${pend.length ? `Captura el avance de la semana y dale <b>Enviar</b>.` : 'Ya enviaste todo esta semana. 👍'}</p>`;
  if (pend.length) h += `<h2>Por capturar</h2>` + pend.map(cardHoja).join('');
  if (env.length) h += `<h2>Enviadas a Fernando</h2>` + env.map(cardHoja).join('');
  marco('Obra VA', 'Velderrain Arquitectos', h);
  enlazar();
}

VISTAS.estimaciones = async (p) => {
  const I = S.inicio || await refrescarInicio();
  const obras = [...new Set(I.hojas.map(h => h.obra))];
  const sel = p.obra || '';
  const hs = I.hojas.filter(h => !sel || h.obra === sel)
    .sort((a, b) => (b.enviado - a.enviado));
  const h = `<div class="filter">${['', ...obras].map(o => `<button data-obra="${esc(o)}" class="${o === sel ? 'on' : ''}">${o ? esc(o) : 'Todas'}</button>`).join('')}</div>
    ${hs.map(cardHoja).join('') || '<div class="empty">Sin destajos</div>'}`;
  marco('Destajos', 'Estimaciones semanales', h);
  $app.querySelectorAll('.filter button').forEach(b => b.onclick = () => ir('estimaciones', { obra: b.dataset.obra }, true));
  enlazar();
};

// --- captura (Raúl) ---
VISTAS.captura = async (p) => {
  marco(p.tab, 'Cargando…', `<div class="empty"><div class="spin" style="margin:30px auto"></div></div>`, { back: true });
  const d = await api('hoja', { tab: p.tab });
  pintarCaptura(d);
};
function pintarCaptura(d) {
  const R = d.resumen;
  const bloqueada = R.enviado && S.yo.rol !== 'director';
  const cambios = {};
  let filtro = 'todos', q = '';
  const lista = () => d.conceptos.filter(c => {
    if (filtro === 'pend' && c.acum >= c.cant) return false;
    if (filtro === 'sem' && !(c.sem > 0)) return false;
    if (q && !(c.concepto.toLowerCase().includes(q) || String(c.clave || '').toLowerCase() === q || String(c.clave || '').toLowerCase().startsWith(q))) return false;
    return true;
  });
  const conHtml = c => {
    const av = c.cant ? c.acum / c.cant : 0;
    const semv = cambios[c.fila] !== undefined ? cambios[c.fila] : (c.sem ?? '');
    const sn = Number(semv) || 0;
    const nv = c.cant ? Math.min((c.acum + sn) / c.cant, 1) : 0;
    const bad = c.acum + sn > c.cant + 0.0001;
    return `<div class="card con" data-f="${c.fila}">
      <div class="desc">${c.clave ? `<b class="clv">${esc(c.clave)}</b> ` : ''}${esc(c.concepto)}</div>
      <div class="prog"><i style="width:${av * 100}%"></i></div>
      <div class="meta"><span>Llevas ${num(c.acum)} de ${num(c.cant)} ${esc(c.un)}</span><span>${pct(nv)}</span></div>
      <div class="cap">
        <div class="step ${cambios[c.fila] !== undefined ? 'dirty' : ''} ${bad ? 'bad' : ''}">
          <button data-a="-" ${bloqueada ? 'disabled' : ''}>−</button>
          <input inputmode="decimal" placeholder="Esta semana" value="${semv === null ? '' : esc(semv)}" ${bloqueada ? 'disabled' : ''}>
          <button data-a="+" ${bloqueada ? 'disabled' : ''}>+</button>
        </div>
        <button class="cam ${c.foto ? 'has' : ''}" data-a="foto" aria-label="Foto">📷</button>
      </div></div>`;
  };
  const ancho = window.matchMedia('(min-width: 900px)').matches;
  const semDe = c => cambios[c.fila] !== undefined ? cambios[c.fila] : (c.sem ?? '');
  const celdas = c => {
    const sn = Number(semDe(c)) || 0, acu = c.acum + sn, por = c.cant - acu;
    return { sd: mxn(sn * c.pu), acu: num(acu), por: num(por), pc: pct(c.cant ? acu / c.cant : 0), sal: mxn(por * c.pu), bad: acu > c.cant + 0.0001 };
  };
  const filaHtml = (c, i) => {
    const k = celdas(c), semv = semDe(c);
    return `<tr class="con ${cambios[c.fila] !== undefined ? 'dirty' : ''} ${k.bad ? 'bad' : ''}" data-f="${c.fila}">
      <td class="cl">${esc(c.clave || '')}</td><td class="tc"><div class="desc" title="${esc(c.concepto)}">${esc(c.concepto)}</div></td><td>${esc(c.un)}</td>
      <td class="nu">${num(c.cant)}</td><td class="nu">${mxn(c.pu)}</td><td class="nu">${mxn(c.cant * c.pu)}</td><td class="nu">${num(c.acum)}</td>
      <td class="ts"><input class="tin" inputmode="decimal" value="${semv === null ? '' : esc(semv)}" ${bloqueada ? 'disabled' : ''}></td>
      <td class="nu c-sd">${k.sd}</td><td class="nu c-acu">${k.acu}</td><td class="nu c-por">${k.por}</td><td class="nu c-pc">${k.pc}</td><td class="nu c-sal">${k.sal}</td>
      <td class="tf"><button class="cam ${c.foto ? 'has' : ''}" data-a="foto" aria-label="Foto">📷</button></td></tr>`;
  };
  const totales = () => {
    let imp = 0, sd = 0, sal = 0;
    d.conceptos.forEach(c => { const sn = Number(semDe(c)) || 0; imp += c.cant * c.pu; sd += sn * c.pu; sal += (c.cant - c.acum - sn) * c.pu; });
    return { imp, sd, sal };
  };
  const tablaHtml = () => {
    const L = lista(), T = totales();
    return `<div class="sabana"><table><thead><tr><th class="cl">CLAVE</th><th>CONCEPTO</th><th>UN</th><th>CANT.</th><th>P/U</th><th>IMPORTE</th><th>ACUM. ANTERIOR</th><th class="ts">ESTA SEM.</th><th>$ ESTA SEM.</th><th>CANT. ACUM.</th><th>POR EJEC.</th><th>%</th><th>SALDO $</th><th>FOTO</th></tr></thead>
      <tbody>${L.map((c) => filaHtml(c, d.conceptos.indexOf(c))).join('')}</tbody>
      <tfoot><tr><td></td><td>TOTAL</td><td></td><td></td><td></td><td class="nu">${mxn(T.imp)}</td><td></td><td></td><td class="nu" id="t-sd">${mxn(T.sd)}</td><td></td><td></td><td></td><td class="nu" id="t-sal">${mxn(T.sal)}</td><td></td></tr></tfoot></table></div>`;
  };
  const sumaSemana = () => d.conceptos.reduce((a, c) => {
    const v = cambios[c.fila] !== undefined ? Number(cambios[c.fila]) || 0 : (c.sem || 0);
    return a + v * c.pu;
  }, 0);
  const render = () => {
    const nC = Object.keys(cambios).length;
    const body = `
      ${bloqueada ? `<div class="card" style="background:var(--orange-soft)"><b>📨 Ya la enviaste</b><div class="mut">Si necesitas corregir, pídele a Fernando que te la regrese.</div></div>` : ''}
      <div class="card"><div class="row"><div class="grow"><div class="ttl">${esc(d.contratista)}</div><div class="mut">${esc(d.obra)} · ${esc(R.folio)}</div></div>
      <div style="text-align:right"><div class="amt" id="tot">${mxn(sumaSemana())}</div><div class="mut" style="font-size:12px">esta semana</div></div></div></div>
      <input class="search" placeholder="Buscar por clave (ej. R.3) o concepto…" value="${esc(q)}" id="q">
      <div class="filter">${[['todos', 'Todos'], ['pend', 'Pendientes'], ['sem', 'Con avance esta semana']].map(([k, l]) =>
        `<button data-k="${k}" class="${filtro === k ? 'on' : ''}">${l}</button>`).join('')}</div>
      <div id="lst">${ancho ? tablaHtml() : (lista().map(conHtml).join('') || '<div class="empty">Nada por aquí</div>')}</div>
      <div style="height:60px"></div>`;
    const acts = bloqueada ? '' :
      `<button class="btn sec grow" id="gd" ${nC ? '' : 'disabled'}>Guardar${nC ? ` (${nC})` : ''}</button>
       <button class="btn pri grow" id="en">Enviar a Fernando</button>`;
    marco(d.tab, `${d.conceptos.length} conceptos`, body, { back: true, acciones: acts });
    const main = document.getElementById('main');
    if (ancho) { main.classList.add('wide'); document.querySelector('.actbar')?.classList.add('wide'); }
    const qi = document.getElementById('q');
    qi.oninput = () => { q = qi.value.toLowerCase(); document.getElementById('lst').innerHTML = ancho ? tablaHtml() : lista().map(conHtml).join(''); };
    if (ancho) {
      main.addEventListener('input', ev => {
        if (!ev.target.classList.contains('tin')) return;
        const tr = ev.target.closest('tr'); const c = d.conceptos.find(x => x.fila === Number(tr.dataset.f));
        cambioT(c, ev.target, tr);
      });
      main.addEventListener('keydown', ev => {
        if (!ev.target.classList.contains('tin')) return;
        if (ev.key === 'Enter' || ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
          ev.preventDefault();
          const ins = [...main.querySelectorAll('.tin:not([disabled])')]; const i = ins.indexOf(ev.target);
          const n = ins[i + (ev.key === 'ArrowUp' ? -1 : 1)]; if (n) { n.focus(); n.select(); }
        }
      });
    }
    main.querySelectorAll('.filter button').forEach(b => b.onclick = () => { filtro = b.dataset.k; render(); });
    main.addEventListener('click', ev => {
      const card = ev.target.closest('.con'); if (!card) return;
      const f = Number(card.dataset.f); const c = d.conceptos.find(x => x.fila === f);
      if (ev.target.classList.contains('desc')) { ev.target.classList.toggle('open'); return; }
      const a = ev.target.dataset.a;
      if (a === 'foto') return tomarFoto(d, c, card);
      if (a === '+' || a === '-') {
        const inp = card.querySelector('input');
        let v = Number(inp.value) || 0; v = Math.max(0, +(v + (a === '+' ? 1 : -1)).toFixed(2));
        inp.value = v; cambio(c, inp, card);
      }
    });
    main.addEventListener('input', ev => {
      if (ev.target.closest('.step')) { const card = ev.target.closest('.con'); const c = d.conceptos.find(x => x.fila === Number(card.dataset.f)); cambio(c, ev.target, card); }
    });
    const gd = document.getElementById('gd'); if (gd) gd.onclick = guardar;
    const en = document.getElementById('en'); if (en) en.onclick = enviar;
  };
  const cambioT = (c, inp, tr) => {
    const raw = inp.value.replace(',', '.').trim();
    const orig = c.sem ?? '';
    if (String(raw) === String(orig)) delete cambios[c.fila]; else cambios[c.fila] = raw === '' ? '' : raw;
    const k = celdas(c);
    tr.classList.toggle('dirty', cambios[c.fila] !== undefined);
    tr.classList.toggle('bad', k.bad);
    tr.querySelector('.c-sd').textContent = k.sd; tr.querySelector('.c-acu').textContent = k.acu; tr.querySelector('.c-por').textContent = k.por;
    tr.querySelector('.c-pc').textContent = k.pc; tr.querySelector('.c-sal').textContent = k.sal;
    const T = totales();
    document.getElementById('t-sd').textContent = mxn(T.sd); document.getElementById('t-sal').textContent = mxn(T.sal);
    document.getElementById('tot').textContent = mxn(sumaSemana());
    const gd = document.getElementById('gd');
    const n = Object.keys(cambios).length;
    if (gd) { gd.disabled = !n; gd.textContent = 'Guardar' + (n ? ` (${n})` : ''); }
  };
  const cambio = (c, inp, card) => {
    const raw = inp.value.replace(',', '.').trim();
    const orig = c.sem ?? '';
    if (String(raw) === String(orig)) delete cambios[c.fila]; else cambios[c.fila] = raw === '' ? '' : raw;
    const sn = Number(raw) || 0;
    const st = card.querySelector('.step');
    st.classList.toggle('dirty', cambios[c.fila] !== undefined);
    st.classList.toggle('bad', c.acum + sn > c.cant + 0.0001);
    card.querySelector('.meta span:last-child').textContent = pct(c.cant ? Math.min((c.acum + sn) / c.cant, 1) : 0);
    document.getElementById('tot').textContent = mxn(sumaSemana());
    const gd = document.getElementById('gd');
    const n = Object.keys(cambios).length;
    if (gd) { gd.disabled = !n; gd.textContent = 'Guardar' + (n ? ` (${n})` : ''); }
  };
  const guardar = async () => {
    const lista = Object.entries(cambios).map(([fila, sem]) => ({ fila: Number(fila), sem: sem === '' ? '' : Number(sem) }));
    if (!lista.length) return true;
    const malos = lista.filter(x => { const c = d.conceptos.find(y => y.fila === x.fila); return c.acum + (Number(x.sem) || 0) > c.cant + 0.0001; });
    if (malos.length) { toast('Hay conceptos en rojo: te pasas del volumen.', true); return false; }
    try {
      const nd = await api('guardar', { tab: d.tab, cambios: lista });
      toast('Guardado ✓'); Object.assign(d, nd); for (const k in cambios) delete cambios[k]; render(); return true;
    } catch (e) { toast(e.message, true); return false; }
  };
  const enviar = async () => {
    if (Object.keys(cambios).length && !(await guardar())) return;
    const tot = sumaSemana();
    const n = d.conceptos.filter(c => c.sem > 0).length;
    const ok = await confirmar('¿Enviar a Fernando?', `${esc(d.contratista)} · ${esc(d.resumen.folio)}<br><br>
      <b>${n}</b> concepto${n === 1 ? '' : 's'} con avance · <b>${mxn(tot)}</b><br><br>Después de enviar ya no podrás cambiarla.`, 'Sí, enviar');
    if (!ok) return;
    try { await api('enviar', { tab: d.tab }); toast('Enviada a Fernando 📨'); S.inicio = null; history.back(); }
    catch (e) { toast(e.message, true); }
  };
  render();
}

// Lee la fecha en que se TOMÓ la foto (EXIF DateTimeOriginal) de un JPEG. Regresa 'AAAA-MM-DD' o 'sin fecha'.
async function fechaDeFoto(file) {
  try {
    const buf = await file.slice(0, 256 * 1024).arrayBuffer();
    const v = new DataView(buf);
    if (v.getUint16(0) !== 0xFFD8) return 'sin fecha';
    let o = 2;
    while (o < v.byteLength - 4) {
      const mk = v.getUint16(o), len = v.getUint16(o + 2);
      if (mk === 0xFFE1 && v.getUint32(o + 4) === 0x45786966) {
        const t = o + 10, le = v.getUint16(t) === 0x4949;
        const u16 = x => v.getUint16(x, le), u32 = x => v.getUint32(x, le);
        const str = (off, n) => { let r = ''; for (let i = 0; i < n; i++) { const ch = v.getUint8(t + off + i); if (!ch) break; r += String.fromCharCode(ch); } return r; };
        const leerIFD = (off, tags) => { const out = {}; const n = u16(t + off); for (let i = 0; i < n; i++) { const e = t + off + 2 + i * 12; const tag = u16(e); if (tags.includes(tag)) out[tag] = u16(e + 2) === 2 ? str(u32(e + 8), u32(e + 4)) : u32(e + 8); } return out; };
        const ifd0 = leerIFD(u32(t + 4), [0x0132, 0x8769]);
        let dt = '';
        if (ifd0[0x8769]) { const ex = leerIFD(ifd0[0x8769], [0x9003, 0x9004]); dt = ex[0x9003] || ex[0x9004] || ''; }
        dt = dt || ifd0[0x0132] || '';
        const m = /^(\d{4}):(\d{2}):(\d{2})/.exec(dt);
        return m ? `${m[1]}-${m[2]}-${m[3]}` : 'sin fecha';
      }
      if ((mk & 0xFF00) !== 0xFF00) break;
      o += 2 + len;
    }
  } catch {}
  return 'sin fecha';
}
const hoyISO = () => { const h = new Date(); return new Date(h - h.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };
const fechaCorta = iso => iso === 'sin fecha' ? 'sin fecha' : iso.slice(8, 10) + '/' + iso.slice(5, 7);

function tomarFoto(d, c, card) {
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = 'image/*';   // sin "capture": deja tomar foto o escoger de la galería
  inp.onchange = async () => {
    const f = inp.files[0]; if (!f) return;
    try {
      const ff = await fechaDeFoto(f);
      if (ff !== hoyISO()) {
        const ok = await confirmar(ff === 'sin fecha' ? 'Esta foto no trae fecha' : `Esta foto es del ${fechaCorta(ff)}`,
          `Las fotos de avance deben ser de hoy.<br><br>Si la subes, quedará marcada como <b>${ff === 'sin fecha' ? 'SIN FECHA' : 'FOTO DEL ' + fechaCorta(ff)}</b> y Fernando lo verá.`, 'Subirla así');
        if (!ok) return;
      }
      toast('Subiendo foto…');
      const data = await achicar(f, 1600, 0.78);
      const r = await api('foto', { tab: d.tab, fila: c.fila, data, fechaFoto: ff });
      c.foto = (c.foto ? c.foto + ' | ' : '') + r.url;
      card.querySelector('.cam').classList.add('has');
      toast('Foto guardada ✓');
    } catch (e) { toast(e.message, true); }
  };
  inp.click();
}
function achicar(file, max, q) {
  return new Promise((ok, no) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const cv = document.createElement('canvas');
      cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
      cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
      URL.revokeObjectURL(img.src); ok(cv.toDataURL('image/jpeg', q));
    };
    img.onerror = () => no(new Error('No pude leer la foto'));
    img.src = URL.createObjectURL(file);
  });
}

// --- detalle / autorizar (Fernando) ---
VISTAS.detalle = async (p) => {
  marco(p.tab, 'Cargando…', `<div class="empty"><div class="spin" style="margin:30px auto"></div></div>`, { back: true });
  const d = await api('hoja', { tab: p.tab });
  const R = d.resumen;
  const sem = d.conceptos.filter(c => c.sem > 0);
  const saldoAntes = R.neto - R.pagado;
  const sugerido = Math.max(0, Math.round(saldoAntes * 100) / 100);
  let forma = R.forma || '';
  const h = `
    <div class="card"><div class="row"><div class="grow"><div class="ttl">${esc(d.contratista)}</div>
      <div class="mut">${esc(d.obra)} · ${esc(R.folio)}</div></div>
      ${R.enviado ? `<span class="chip or">📨 ${esc(R.fechaEnvio.slice(0, 11))}</span>` : `<span class="chip gr">Sin enviar</span>`}</div></div>
    <h2>Esta semana (${sem.length})</h2>
    ${sem.length ? `<div class="card">${sem.map(c => `<div class="kv"><span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${c.clave ? `<b class="clv">${esc(c.clave)}</b> ` : ''}${esc(c.concepto)}</span>
       <span class="amt">${num(c.sem)} ${esc(c.un)} · ${mxn0(c.sem * c.pu)}</span></div>`).join('')}</div>` : `<div class="card mut">Sin avance capturado esta semana.</div>`}
    <button class="btn sec full" id="ver" style="margin-bottom:6px">Ver todos los conceptos / corregir</button>
    <h2>Números</h2>
    <div class="card">
      <div class="kv"><span>Esta estimación</span><span class="amt">${mxn(R.estaEstimacion)}</span></div>
      <div class="kv"><span>Ejecutado acumulado</span><span class="amt">${mxn(R.ejecutado)}</span></div>
      <div class="kv"><span>Retención</span><span class="amt">−${mxn(R.retencion)}</span></div>
      <div class="kv"><span>Pagado hasta hoy</span><span class="amt">−${mxn(R.pagado)}</span></div>
      <div class="kv tot"><span>Saldo a favor del contratista</span><span class="amt">${mxn(saldoAntes)}</span></div>
    </div>
    <h2>Autorizar pago</h2>
    <div class="card">
      <div class="fld"><label>¿Cuánto le pagas?</label>
        <input class="inp money" id="pg" inputmode="decimal" value="${R.pago || (sugerido || '')}"></div>
      <div class="fld"><label>Forma</label><div class="seg" id="fm">
        ${['Efectivo', 'Facturado'].map(f => `<button data-f="${f}" class="${forma === f ? 'on' : ''}">${f}</button>`).join('')}</div></div>
      <div class="mut" id="sd"></div>
    </div>
    ${R.enviado ? `<button class="btn ghost full" id="rg">↩︎ Regresársela a Raúl para corregir</button>` : ''}
    <div style="height:70px"></div>`;
  marco(d.tab, R.folio, h, { back: true, acciones: `<button class="btn pri grow" id="ok">Autorizar y cerrar</button>` });
  const pg = document.getElementById('pg');
  const sd = document.getElementById('sd');
  const upd = () => { const v = Number(pg.value.replace(/[$,\s]/g, '')) || 0; sd.innerHTML = `Saldo después del pago: <b>${mxn(saldoAntes - v)}</b>${v > saldoAntes + 0.005 ? ' · <span style="color:var(--warn)">es anticipo</span>' : ''}`; };
  pg.oninput = upd; upd();
  document.querySelectorAll('#fm button').forEach(b => b.onclick = () => { forma = b.dataset.f; document.querySelectorAll('#fm button').forEach(x => x.classList.toggle('on', x === b)); });
  document.getElementById('ver').onclick = () => ir('captura', { tab: d.tab, de: 'estimaciones' });
  const rg = document.getElementById('rg');
  if (rg) rg.onclick = async () => {
    if (!(await confirmar('¿Regresar a Raúl?', 'Raúl podrá corregir el avance y volver a enviarla.', 'Sí, regresar'))) return;
    try { await api('regresar', { tab: d.tab }); toast('Regresada a Raúl'); S.inicio = null; history.back(); } catch (e) { toast(e.message, true); }
  };
  document.getElementById('ok').onclick = async () => {
    const v = Math.round((Number(pg.value.replace(/[$,\s]/g, '')) || 0) * 100) / 100;
    if (v > 0 && !forma) return toast('Elige Efectivo o Facturado', true);
    const ok = await confirmar(`¿Cerrar ${R.folio}?`, `${esc(d.contratista)} · ${esc(d.obra)}<br><br>
      Pago autorizado: <b>${mxn(v)}</b>${v > 0 ? ` (${forma})` : ''}<br>Saldo después: <b>${mxn(saldoAntes - v)}</b><br><br>
      ${v > 0 ? 'Se manda a Fanny para que lo pague.' : 'Sin pago: no se manda nada a Fanny.'}`, 'Sí, autorizar');
    if (!ok) return;
    try {
      const r = await api('cerrar', { tab: d.tab, pago: v, forma, folio: R.folio });
      S.inicio = null;
      abrirModal(`<div style="text-align:center"><div style="font-size:44px">✅</div><h3>${esc(r.folio)} cerrada</h3>
        <p class="mut">${r.pago > 0 ? `${mxn(r.pago)} (${esc(r.forma)}) mandado a Fanny.` : 'Sin pago.'}<br>Siguiente: ${esc(r.siguiente)}</p>
        <button class="btn pri full" id="x">Listo</button></div>`).querySelector('#x').onclick = () => { cerrarModal(); history.back(); };
    } catch (e) { toast(e.message, true); }
  };
};

// --- subcontratos ---
VISTAS.hitos = async (p) => {
  marco('Subcontratos', 'Hitos', `<div class="empty"><div class="spin" style="margin:30px auto"></div></div>`);
  const hs = await api('hitos');
  pintarHitos(hs, p);
};
function pintarHitos(hs, p) {
  const dir = S.yo.rol === 'director';
  const grupos = {};
  hs.forEach(x => (grupos[x.codigo] = grupos[x.codigo] || []).push(x));
  const sel = p.c || '';
  const porPagar = hs.filter(x => x.cumplido && x.monto > 0 && !x.folio);
  let h = '';
  if (dir && porPagar.length) {
    h += `<h2>Por autorizar</h2>` + porPagar.map(x => `<div class="card"><div class="row"><div class="grow">
      <div class="ttl">${esc(x.proveedor)}</div><div class="mut">${esc(x.hito)} · cumplido ${esc(x.fecha)}</div></div>
      <div class="amt">${mxn(x.monto)}</div></div>
      <div style="margin-top:10px"><button class="btn pri full" data-pagar="${x.fila}">Autorizar pago</button></div></div>`).join('');
  }
  h += `<h2>Contratos</h2>`;
  h += Object.entries(grupos).map(([cod, xs]) => {
    const hechos = xs.filter(x => x.cumplido).length;
    const fis = Math.max(0, ...xs.filter(x => x.cumplido).map(x => x.pctFisico));
    const abierto = sel === cod;
    const prov = xs[0].proveedor;
    const sinProv = /POR ASIGNAR/i.test(prov) || !prov;
    return `<div class="card ${abierto ? '' : 'tap'}" data-c="${esc(cod)}">
      <div class="row"><div class="grow"><div class="ttl">${esc(cod.replace(/^ALC22-/, ''))}</div>
      <div class="mut">${esc(sinProv ? 'Sin contratista todavía' : prov)}</div></div>
      <span class="chip ${fis >= 1 ? 'ok' : fis > 0 ? 'bl' : 'gr'}">${pct(fis)}</span></div>
      <div class="prog"><i class="${fis > 0 ? '' : ''}" style="width:${fis * 100}%"></i></div>
      ${abierto ? `<div style="margin-top:10px">${xs.map(x => `
        <div class="kv" style="align-items:center">
          <label style="display:flex;gap:10px;align-items:center;flex:1;min-width:0;color:var(--ink)">
            <input type="checkbox" data-h="${x.fila}" ${x.cumplido ? 'checked' : ''} ${x.folio ? 'disabled' : ''} style="width:22px;height:22px;accent-color:var(--orange)">
            <span style="min-width:0"><span>${esc(x.hito)}</span><br><span class="mut" style="font-size:12px">${pct(x.pctFisico)} físico${x.monto ? ' · paga ' + mxn0(x.monto) : ''}</span></span>
          </label>
          ${x.folio ? `<span class="chip ${/PAGADO/.test(x.estado) ? 'ok' : 'bl'}">${/PAGADO/.test(x.estado) ? 'Pagado' : 'Con Fanny'}</span>` : x.cumplido ? `<span class="mut" style="font-size:12px">${esc(x.fecha)}</span>` : ''}
        </div>`).join('')}</div>` : `<div class="mut" style="margin-top:4px;font-size:12px">${hechos} de ${xs.length} hitos</div>`}
    </div>`;
  }).join('');
  marco('Subcontratos', `${Object.keys(grupos).length} contratos`, h);
  const main = document.getElementById('main');
  main.querySelectorAll('.card.tap[data-c]').forEach(c => c.onclick = () => ir('hitos', { c: c.dataset.c }, true));
  main.querySelectorAll('input[data-h]').forEach(cb => cb.onchange = async () => {
    const x = hs.find(y => y.fila === Number(cb.dataset.h));
    const ok = await confirmar(cb.checked ? '¿Marcar como cumplido?' : '¿Quitar la palomita?', `${esc(x.codigo)}<br><b>${esc(x.hito)}</b>`, cb.checked ? 'Sí, cumplido' : 'Sí, quitar');
    if (!ok) { cb.checked = !cb.checked; return; }
    try { const n = await api('hitoCumplido', { fila: x.fila, valor: cb.checked }); toast('Listo ✓'); S.inicio = null; pintarHitos(n, p); }
    catch (e) { cb.checked = !cb.checked; toast(e.message, true); }
  });
  main.querySelectorAll('[data-pagar]').forEach(b => b.onclick = () => pagarHito(hs.find(y => y.fila === Number(b.dataset.pagar)), p));
}
function pagarHito(x, p) {
  let forma = '';
  const sh = abrirModal(`<h3>Autorizar pago</h3><div class="mut">${esc(x.proveedor)}<br>${esc(x.hito)}</div>
    <div class="big" style="margin:14px 0">${mxn(x.monto)}</div>
    <div class="fld"><label>Forma</label><div class="seg">${['Efectivo', 'Facturado'].map(f => `<button data-f="${f}">${f}</button>`).join('')}</div></div>
    <div class="mut">Se manda a Fanny con folio SUB-…</div>
    <div class="acts"><button class="btn sec grow" id="n">Cancelar</button><button class="btn pri grow" id="s" disabled>Sí, autorizar</button></div>`);
  sh.querySelectorAll('.seg button').forEach(b => b.onclick = () => { forma = b.dataset.f; sh.querySelectorAll('.seg button').forEach(y => y.classList.toggle('on', y === b)); sh.querySelector('#s').disabled = false; });
  sh.querySelector('#n').onclick = cerrarModal;
  sh.querySelector('#s').onclick = async () => {
    cerrarModal();
    try { const r = await api('hitoPagar', { fila: x.fila, forma }); toast(`${r.folio} mandado a Fanny ✓`); S.inicio = null; VISTAS.hitos(p); }
    catch (e) { toast(e.message, true); }
  };
}

// --- pagos (Fanny) ---
VISTAS.fanny = async () => {
  if (S.yo.rol === 'tesoreria') return VISTAS.inicio();
  marco('Pagos', 'Con Fanny', `<div class="empty"><div class="spin" style="margin:30px auto"></div></div>`);
  vistaFanny(await api('pendientes'));
};
function vistaFanny(F) {
  const esF = S.yo.rol === 'tesoreria';
  const tot = F.lista.reduce((a, x) => a + x.importe, 0);
  let h = `${esF ? `<div class="hello">${saludo()}, ${esc(S.yo.nombre)}</div>` : ''}
    <div class="card" style="background:var(--navy);color:#fff">
      <div style="opacity:.75;font-size:13px">💵 Efectivo a llevar hoy</div>
      <div class="big">${mxn(F.efectivo)}</div>
      <div style="opacity:.75;font-size:13px;margin-top:8px">🏦 Cuenta fiscal a cubrir hoy: <b style="opacity:1">${mxn(F.fiscal || 0)}</b></div>
      ${F.caja != null ? `<div style="opacity:.75;font-size:13px;margin-top:4px">💼 En caja: <b style="opacity:1">${mxn(F.caja)}</b> · después de pagar ${mxn(F.caja - tot)}</div>` : ''}
      <div style="opacity:.75;font-size:13px;margin-top:4px">${F.lista.length} pago${F.lista.length === 1 ? '' : 's'} pendiente${F.lista.length === 1 ? '' : 's'} · ${mxn0(tot)}</div>
    </div>
    <button class="btn pri full" id="ng" style="margin-bottom:6px">＋ Registrar gasto</button>
    <h2>Por pagar</h2>`;
  h += F.lista.length ? F.lista.map(x => `<div class="card">
      <div class="row"><div class="grow"><div class="ttl">${esc(x.persona)}</div>
      <div class="mut">${esc(x.concepto)}</div><div class="mut" style="font-size:12px">${esc(x.obra)} · ${esc(x.fecha)} · ${esc(x.folio)}</div></div>
      <div style="text-align:right"><div class="amt">${mxn(x.importe)}</div><span class="chip ${x.forma === 'Efectivo' ? 'ok' : 'bl'}">${esc(x.forma || '—')}</span></div></div>
      ${x.porAprobar ? `<div style="margin-top:10px"><span class="chip wa">⏳ Espera aprobación de Fernando</span></div>`
        : `<button class="btn ${esF ? 'pri' : 'sec'} full" style="margin-top:10px" data-p="${x.fila}">✓ Ya lo pagué</button>`}
    </div>`).join('') : `<div class="empty"><div class="e">🎉</div>No hay pagos pendientes</div>`;
  h += `<h2>Ya capturados</h2>
    <div class="filter" id="mf">${[[1, 'Hoy'], [7, '7 días'], [30, '30 días']].map(([d, l]) => `<button data-d="${d}" class="${(S.cache.movDias || 7) === d ? 'on' : ''}">${l}</button>`).join('')}</div>
    <input class="search" id="mq" placeholder="Buscar persona, concepto o proyecto…">
    <div id="ml"><div class="empty"><div class="spin" style="margin:10px auto"></div></div></div>
    <div style="height:20px"></div>`;
  marco(esF ? 'Pagos' : 'Pagos con Fanny', esF ? 'Velderrain Arquitectos' : '', h);
  document.getElementById('ng').onclick = () => ir('gasto', { de: esF ? 'inicio' : 'fanny' });
  cargarMovs();
  document.querySelectorAll('#mf button').forEach(b => b.onclick = () => { S.cache.movDias = Number(b.dataset.d); document.querySelectorAll('#mf button').forEach(x => x.classList.toggle('on', x === b)); cargarMovs(); });
  document.getElementById('mq').oninput = () => pintarMovs();
  document.querySelectorAll('[data-p]').forEach(b => b.onclick = () => marcarPagado(F.lista.find(y => y.fila === Number(b.dataset.p))));
}

async function cargarMovs() {
  const el = document.getElementById('ml'); if (!el) return;
  try { S.cache.movs = await api('movimientos', { dias: S.cache.movDias || 7 }); pintarMovs(); }
  catch (e) { el.innerHTML = `<div class="empty">${esc(e.message)}</div>`; }
}
const diaTxt = iso => { const hoy = new Date(); const f = new Date(iso + 'T12:00:00'); const d = Math.round((new Date(hoy.toDateString()) - new Date(f.toDateString())) / 864e5);
  return d === 0 ? 'Hoy' : d === 1 ? 'Ayer' : f.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'short' }); };
function pintarMovs() {
  const el = document.getElementById('ml'); if (!el) return;
  const q = (document.getElementById('mq')?.value || '').toLowerCase();
  const L = (S.cache.movs || []).filter(x => !q || [x.persona, x.concepto, x.obra, x.folio].join(' ').toLowerCase().includes(q));
  if (!L.length) { el.innerHTML = `<div class="empty">Nada capturado en este periodo</div>`; return; }
  const dias = {}; L.forEach(x => (dias[x.fecha] = dias[x.fecha] || []).push(x));
  el.innerHTML = Object.keys(dias).sort().reverse().map(f => {
    const xs = dias[f]; const eg = xs.filter(x => x.tipo === 'Egreso').reduce((a, x) => a + x.importe, 0);
    return `<div class="mut" style="display:flex;justify-content:space-between;margin:14px 4px 6px;font-weight:600;text-transform:capitalize"><span>${esc(diaTxt(f))} · ${xs.length}</span><span>${eg ? 'salió ' + mxn0(eg) : ''}</span></div>
      <div class="card" style="padding:4px 14px">${xs.map(x => `<div class="kv" style="align-items:center">
        <span style="flex:1;min-width:0;color:var(--ink)"><b style="font-weight:600">${esc(x.persona)}</b> · ${esc(x.concepto)}<br><span class="mut" style="font-size:12px">${esc(x.obra)} · ${esc(x.folio)}${x.tipo !== 'Egreso' ? ' · ' + esc(x.tipo) : ''}${x.foto ? ' · 📷' : ''}${String(x.origen || '').startsWith('Manual') ? ' · app' : ''}</span></span>
        <span style="text-align:right"><span class="amt" style="${x.tipo === 'Ingreso' ? 'color:var(--ok)' : ''}">${x.tipo === 'Ingreso' ? '+' : ''}${mxn(x.importe)}</span><br>
        <span class="chip ${String(x.revision || '').startsWith('RECHAZADO') ? 'wa' : x.pagado ? 'ok' : 'gr'}" style="font-size:10.5px">${String(x.revision || '').startsWith('RECHAZADO') ? 'Rechazado' : x.revision === 'POR APROBAR' ? 'Por aprobar' : x.pagado ? 'Pagado' : 'Por pagar'}</span></span></div>`).join('')}</div>`;
  }).join('');
}

// pide una foto con la cámara y la regresa achicada
function pedirFoto() {
  return new Promise((ok) => {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'image/*';
    inp.onchange = async () => { const f = inp.files[0]; if (!f) return ok(null); try { ok(await achicar(f, 1600, 0.78)); } catch { ok(null); } };
    inp.click();
  });
}
function cajaFoto(sh, sel, cb) {
  const b = sh.querySelector(sel);
  b.onclick = async () => {
    const d = await pedirFoto(); if (!d) return;
    cb(d);
    b.innerHTML = `<img src="${d}" alt="" style="width:56px;height:56px;object-fit:cover;border-radius:8px"> <span>Foto lista ✓ (tocar para cambiar)</span>`;
    b.classList.add('ok');
  };
}

function marcarPagado(x) {
  const fact = x.forma === 'Facturado';
  let foto = null;
  const yaTiene = !!x.foto;
  const sh = abrirModal(`<h3>¿Ya lo pagaste?</h3><div class="mut">${esc(x.persona)} · ${esc(x.concepto)}</div>
    <div class="big" style="margin:12px 0">${mxn(x.importe)}</div>
    <div class="fld"><label>Foto del recibo firmado o de la transferencia${yaTiene ? ' (ya tiene una; opcional)' : ''}</label>
      <button class="btn sec full fotobtn" id="ft">📷 Tomar foto</button></div>
    ${fact ? `<div class="fld"><label>UUID / folio fiscal de la factura</label><input class="inp" id="uu" value="${esc(x.uuid || '')}" placeholder="xxxxxxxx-xxxx-…"></div>` : ''}
    <div class="acts"><button class="btn sec grow" id="n">Todavía no</button><button class="btn pri grow" id="s">Sí, pagado</button></div>`);
  cajaFoto(sh, '#ft', d => foto = d);
  sh.querySelector('#n').onclick = cerrarModal;
  sh.querySelector('#s').onclick = async () => {
    const uuid = fact ? sh.querySelector('#uu').value.trim() : '';
    if (!foto && !yaTiene) return toast('Falta la foto del recibo o la transferencia', true);
    if (fact && !uuid) return toast('Escribe el UUID de la factura', true);
    cerrarModal();
    try { toast('Guardando…'); const F = await api('pagado', { fila: x.fila, folio: x.folio, uuid, foto }); toast('Pagado ✓'); if (S.inicio) S.inicio.fanny = F; S.cache.movs = null; vistaFanny(F); }
    catch (e) { toast(e.message, true); }
  };
}

// --- registrar gasto directo (Fanny / Fernando) ---
VISTAS.gasto = async () => {
  marco('Registrar gasto', 'Gasto directo', `<div class="empty"><div class="spin" style="margin:30px auto"></div></div>`, { back: true });
  const C = S.cache.cat || (S.cache.cat = await api('catalogos'));
  const hoy = new Date(); const iso = new Date(hoy - hoy.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
  let forma = 'Efectivo', foto = null, pagado = true;
  const opt = arr => arr.map(o => `<option value="${esc(o)}">`).join('');
  const h = `
    <div class="card">
      <div class="fld"><label>Proyecto</label><select class="inp" id="obs"><option value="">Escoge…</option>${C.obras.map(o => `<option>${esc(o)}</option>`).join('')}<option value="__n">＋ Proyecto nuevo…</option></select>
        <input class="inp hidden" id="ob" placeholder="Nombre del proyecto nuevo" style="margin-top:8px"></div>
      <div class="fld"><label>Categoría</label><select class="inp" id="ca"><option value="">Escoge…</option>${C.categorias.map(c => `<option>${esc(c)}</option>`).join('')}</select></div>
      <div class="fld"><label>Concepto (qué se pagó, 3 a 8 palabras)</label><input class="inp" id="co" placeholder="Ej. Instalación de reloj checador"></div>
      <div class="fld"><label>¿A quién se le pagó?</label><select class="inp" id="pes"><option value="">Escoge…</option>${C.personas.map(o => `<option>${esc(o)}</option>`).join('')}<option value="__n">＋ Persona nueva…</option></select>
        <input class="inp hidden" id="pe" placeholder="Nombre completo de la persona nueva" style="margin-top:8px"></div>
      <div class="fld"><label>Monto neto pagado</label><input class="inp money" id="mo" inputmode="decimal" placeholder="$0.00"></div>
      <div class="fld"><label>Forma</label><div class="seg" id="fm"><button data-f="Efectivo" class="on">Efectivo</button><button data-f="Facturado">Facturado</button></div></div>
      <div class="fld"><label>¿Ya se pagó?</label><div class="seg" id="yp"><button data-p="1" class="on">Sí, ya se pagó</button><button data-p="0">Todavía no</button></div></div>
      <div class="fld"><label>Fecha del pago</label><input class="inp" id="fe" type="date" value="${iso}" max="${iso}"></div>
      <div class="fld"><label>Foto del recibo, ticket, nota o transferencia</label><button class="btn sec full fotobtn" id="ft">📷 Tomar foto</button></div>
      <div class="fld"><label>Nota (opcional)</label><input class="inp" id="nt" placeholder="Ej. Lo pidió Fernando por WhatsApp"></div>
      <div class="mut" id="lim" style="font-size:13px"></div>
    </div><div style="height:70px"></div>`;
  marco('Registrar gasto', 'Gasto directo', h, { back: true, acciones: `<button class="btn pri grow" id="gu">Guardar gasto</button>` });
  const $ = id => document.getElementById(id);
  const sh = document.getElementById('main');
  cajaFoto(sh, '#ft', d => foto = d);
  document.querySelectorAll('#fm button').forEach(b => b.onclick = () => { forma = b.dataset.f; document.querySelectorAll('#fm button').forEach(x => x.classList.toggle('on', x === b)); });
  const lim = () => { const v = Number($('mo').value.replace(/[$,\s]/g, '')) || 0; $('lim').innerHTML = v > C.limite && S.yo.rol !== 'director' ? `⏳ Más de ${mxn0(C.limite)}: quedará esperando la aprobación de Fernando antes de pagarse.` : ''; };
  $('mo').oninput = lim;
  document.querySelectorAll('#yp button').forEach(b => b.onclick = () => { pagado = b.dataset.p === '1'; document.querySelectorAll('#yp button').forEach(x => x.classList.toggle('on', x === b)); });
  const otro = (selId, inpId) => { $(selId).onchange = () => { const n = $(selId).value === '__n'; $(inpId).classList.toggle('hidden', !n); if (n) $(inpId).focus(); }; };
  otro('obs', 'ob'); otro('pes', 'pe');
  const val = (selId, inpId) => $(selId).value === '__n' ? $(inpId).value.trim() : $(selId).value;
  $('gu').onclick = async () => {
    const d = { obra: val('obs', 'ob'), categoria: $('ca').value, concepto: $('co').value.trim(), persona: val('pes', 'pe'),
      monto: Number($('mo').value.replace(/[$,\s]/g, '')) || 0, forma, fecha: $('fe').value, nota: $('nt').value.trim(), foto, pagado };
    if (!d.obra || !d.categoria || !d.concepto || !d.persona) return toast('Falta proyecto, categoría, concepto o a quién', true);
    if (!(d.monto > 0)) return toast('Escribe el monto', true);
    if (!foto) return toast('Falta la foto del comprobante', true);
    try { if (!S.cache.movs) S.cache.movs = await api('movimientos', { dias: 7 }); } catch {}
    const dup = (S.cache.movs || []).find(m => m.tipo === 'Egreso' && Math.abs(m.importe - d.monto) < 0.01 && String(m.persona).toLowerCase() === d.persona.toLowerCase());
    if (dup && !(await confirmar('¿Ya lo capturaste?', `Ya hay un pago a <b>${esc(dup.persona)}</b> por <b>${mxn(dup.importe)}</b> del ${esc(diaTxt(dup.fecha))} (${esc(dup.folio)} · ${esc(dup.concepto)}).<br><br>¿Es otro pago distinto?`, 'Sí, es otro'))) return;
    const nuevo = $('obs').value === '__n' && !C.obras.some(o => o.toLowerCase() === d.obra.toLowerCase());
    const pNueva = $('pes').value === '__n';
    const ok = await confirmar('¿Guardar gasto?', `${esc(d.persona)} · ${esc(d.concepto)}<br>${esc(d.obra)}${nuevo ? ' <b>(proyecto nuevo)</b>' : ''} · ${esc(d.categoria)}<br><br><b>${mxn(d.monto)}</b> ${esc(forma)} · ${pagado ? 'ya pagado' : 'queda por pagar'}${d.monto > C.limite && S.yo.rol !== 'director' ? '<br><br>Quedará esperando la aprobación de Fernando.' : ''}`, 'Sí, guardar');
    if (!ok) return;
    try {
      toast('Guardando…');
      const r = await api('gasto', d);
      if (nuevo || pNueva) S.cache.cat = null;
      S.cache.movs = null;
      S.inicio = null;
      toast(r.porAprobar ? `${r.folio} enviado a Fernando ⏳` : `${r.folio} guardado ✓${pagado ? '' : ' (por pagar)'}`);
      history.back();
    } catch (e) { toast(e.message, true); }
  };
};

// --- revisión de gastos directos (Fernando) ---
VISTAS.gastos = async () => {
  marco('Gastos directos', 'Por revisar', `<div class="empty"><div class="spin" style="margin:30px auto"></div></div>`, { back: true });
  pintarGastos(await api('gastosRevisar'));
};
function pintarGastos(L) {
  const apr = L.filter(x => x.porAprobar), rev = L.filter(x => !x.porAprobar);
  const card = x => `<div class="card">
    <div class="row"><div class="grow"><div class="ttl">${esc(x.persona)}</div><div class="mut">${esc(x.concepto)}</div>
      <div class="mut" style="font-size:12px">${esc(x.obra)} · ${esc(x.categoria)} · ${esc(x.fecha)} · ${esc(x.folio)} · ${esc(String(x.origen || '').replace('Manual - ', 'App · '))}${x.pagado ? '' : ' · por pagar'}</div></div>
      <div style="text-align:right"><div class="amt">${mxn(x.importe)}</div><span class="chip ${x.forma === 'Efectivo' ? 'ok' : 'bl'}">${esc(x.forma)}</span></div></div>
    ${x.foto ? `<a href="${esc(String(x.foto).split(' | ')[0])}" target="_blank" rel="noopener" class="mut" style="display:inline-block;margin-top:8px">📷 Ver comprobante ↗</a>` : '<div class="mut" style="margin-top:8px;color:var(--bad)">Sin foto</div>'}
    <div class="row" style="margin-top:10px;gap:8px">
      <button class="btn danger grow" data-x="rechazar" data-f="${x.fila}">Rechazar</button>
      <button class="btn pri grow" data-x="${x.porAprobar ? 'aprobar' : 'revisado'}" data-f="${x.fila}">${x.porAprobar ? 'Aprobar' : '✓ Revisado'}</button>
    </div></div>`;
  let h = '';
  if (apr.length) h += `<h2>Esperan tu aprobación (más de $10,000)</h2>` + apr.map(card).join('');
  h += `<h2>Gastos directos por revisar</h2>` + (rev.length ? rev.map(card).join('') : `<div class="empty"><div class="e">✅</div>Todo revisado</div>`);
  marco('Gastos directos', `${L.length} por revisar`, h, { back: true });
  document.querySelectorAll('[data-x]').forEach(b => b.onclick = async () => {
    const x = L.find(y => y.fila === Number(b.dataset.f)); const dec = b.dataset.x;
    let motivo = '';
    if (dec === 'rechazar') {
      const r = await new Promise(res => {
        const sh = abrirModal(`<h3>¿Rechazar?</h3><div class="mut">${esc(x.persona)} · ${esc(x.concepto)} · ${mxn(x.importe)}</div>
          <div class="fld" style="margin-top:12px"><label>Motivo</label><input class="inp" id="mt" placeholder="Ej. No corresponde a este proyecto"></div>
          <div class="acts"><button class="btn sec grow" id="n">Cancelar</button><button class="btn danger grow" id="s">Rechazar</button></div>`);
        sh.querySelector('#n').onclick = () => { cerrarModal(); res(null); };
        sh.querySelector('#s').onclick = () => { const m = sh.querySelector('#mt').value.trim(); cerrarModal(); res(m || 'sin motivo'); };
      });
      if (r === null) return; motivo = r;
    } else if (dec === 'aprobar') {
      if (!(await confirmar('¿Aprobar gasto?', `${esc(x.persona)} · ${esc(x.concepto)}<br><b>${mxn(x.importe)}</b><br><br>Fanny ya podrá pagarlo.`, 'Sí, aprobar'))) return;
    }
    try { const n = await api('gastoRevisar', { fila: x.fila, folio: x.folio, decision: dec, motivo }); toast('Listo ✓'); S.inicio = null; pintarGastos(n); }
    catch (e) { toast(e.message, true); }
  });
}

// --- más (Fernando) ---
VISTAS.mas = async () => {
  const h = `<h2>Dinero</h2>
    <div class="card tap" data-go="gastos"><div class="row"><div class="grow"><div class="ttl">🧾 Gastos directos</div><div class="mut">Lo que Fanny registró sin contrato: revisar, aprobar o rechazar</div></div>${S.inicio?.gastos?.length ? `<span class="chip or">${S.inicio.gastos.length}</span>` : '›'}</div></div>
    <div class="card tap" data-go="gasto"><div class="row"><div class="grow"><div class="ttl">＋ Registrar un gasto</div><div class="mut">Queda revisado a tu nombre</div></div>›</div></div>
    <h2>Administración</h2>
    <div class="card tap" data-go="usuarios"><div class="row"><div class="grow"><div class="ttl">👥 Usuarios</div><div class="mut">Quién entra a la app y qué puede hacer</div></div>›</div></div>
    <div class="card tap" data-go="bitacora"><div class="row"><div class="grow"><div class="ttl">🧾 Bitácora</div><div class="mut">Todo lo que se movió, quién y cuándo</div></div>›</div></div>
    <h2>Hojas</h2>
    <a class="card tap" style="display:block;text-decoration:none;color:inherit" href="https://docs.google.com/spreadsheets/d/1fJnkURxbJd_bxLgX3McftW-1Ss9wNKSxwNEj0iCUyC4/edit" target="_blank" rel="noopener"><div class="row"><div class="grow"><div class="ttl">📊 Estimaciones V2.0</div><div class="mut">Abrir la hoja completa</div></div>↗</div></a>
    <a class="card tap" style="display:block;text-decoration:none;color:inherit" href="https://docs.google.com/spreadsheets/d/1w1UhXU78CEV17k8_EJWPi8fweZBh6uyO5GlERoVm7Co/edit" target="_blank" rel="noopener"><div class="row"><div class="grow"><div class="ttl">💵 Control de Flujos V2.0</div><div class="mut">Registro de Fanny</div></div>↗</div></a>
    <a class="card tap" style="display:block;text-decoration:none;color:inherit" href="https://claude.ai/artifact/4SgQPzDQdZRuHBp4vChbX2" target="_blank" rel="noopener"><div class="row"><div class="grow"><div class="ttl">📅 Programa de obra Alcázar 22</div><div class="mut">Gantt y avance</div></div>↗</div></a>`;
  marco('Más', '', h); enlazar();
};
VISTAS.usuarios = async () => {
  marco('Usuarios', '', `<div class="empty"><div class="spin" style="margin:30px auto"></div></div>`, { back: true });
  const us = await api('usuarios');
  const h = us.map(u => `<div class="card tap" data-e="${esc(u.email)}"><div class="row">
      <div class="av" style="width:36px;height:36px;border-radius:50%;background:${u.activo ? 'var(--navy-2)' : '#cbd5e1'};color:#fff;display:grid;place-items:center;font-weight:700">${esc(ini(u.nombre))}</div>
      <div class="grow"><div class="ttl">${esc(u.nombre)}</div><div class="mut">${esc(u.email)}</div></div>
      <span class="chip ${u.activo ? 'bl' : 'gr'}">${u.activo ? esc(rolTxt(u.rol)) : 'Sin acceso'}</span></div></div>`).join('');
  marco('Usuarios', `${us.length}`, h + '<div style="height:60px"></div>', { back: true, acciones: `<button class="btn pri grow" id="nu">＋ Agregar persona</button>` });
  document.getElementById('nu').onclick = () => editarUsuario({ activo: true, rol: 'residente' });
  document.querySelectorAll('[data-e]').forEach(c => c.onclick = () => editarUsuario(us.find(u => u.email === c.dataset.e)));
};
function editarUsuario(u) {
  let rol = u.rol, activo = u.activo;
  const nuevo = !u.email;
  const sh = abrirModal(`<h3>${nuevo ? 'Agregar persona' : esc(u.nombre)}</h3>
    <div class="fld" style="margin-top:12px"><label>Correo de Gmail</label><input class="inp" id="em" type="email" value="${esc(u.email || '')}" ${nuevo ? '' : 'readonly'}></div>
    <div class="fld"><label>Nombre</label><input class="inp" id="nm" value="${esc(u.nombre || '')}"></div>
    <div class="fld"><label>Qué hace</label><div class="seg" id="rl">${['residente', 'tesoreria', 'director'].map(r => `<button data-r="${r}" class="${rol === r ? 'on' : ''}">${rolTxt(r)}</button>`).join('')}</div></div>
    <div class="fld"><label>Acceso</label><div class="seg" id="ac"><button data-a="1" class="${activo ? 'on' : ''}">Puede entrar</button><button data-a="0" class="${activo ? '' : 'on'}">Sin acceso</button></div></div>
    <div class="mut" style="font-size:12.5px">Mientras la app esté en modo prueba, también hay que darlo de alta en Google (dímelo y lo hago).</div>
    <div class="acts"><button class="btn sec grow" id="n">Cancelar</button><button class="btn pri grow" id="s">Guardar</button></div>`);
  sh.querySelectorAll('#rl button').forEach(b => b.onclick = () => { rol = b.dataset.r; sh.querySelectorAll('#rl button').forEach(y => y.classList.toggle('on', y === b)); });
  sh.querySelectorAll('#ac button').forEach(b => b.onclick = () => { activo = b.dataset.a === '1'; sh.querySelectorAll('#ac button').forEach(y => y.classList.toggle('on', y === b)); });
  sh.querySelector('#n').onclick = cerrarModal;
  sh.querySelector('#s').onclick = async () => {
    const email = sh.querySelector('#em').value.trim(), nombre = sh.querySelector('#nm').value.trim();
    if (!email || !nombre) return toast('Falta correo o nombre', true);
    if (rol === 'director' && !(await confirmar('¿Darle permisos de director?', 'Podrá autorizar pagos y ver todo.', 'Sí'))) return;
    cerrarModal();
    try { await api('usuarioGuardar', { email, nombre, rol, activo }); toast('Guardado ✓'); VISTAS.usuarios(); }
    catch (e) { toast(e.message, true); }
  };
}
VISTAS.bitacora = async () => {
  marco('Bitácora', '', `<div class="empty"><div class="spin" style="margin:30px auto"></div></div>`, { back: true });
  const L = await api('bitacora');
  const h = L.length ? L.map(x => `<div class="card log"><div class="row"><div class="grow"><div class="ttl">${esc(x.accion)}</div>
    <div class="mut">${esc(x.donde)} · ${esc(String(x.quien).split('@')[0])}</div></div><div class="mut">${esc(x.fecha)}</div></div>
    ${x.detalle ? `<div class="mut" style="margin-top:6px;word-break:break-word">${esc(x.detalle)}</div>` : ''}</div>`).join('')
    : `<div class="empty"><div class="e">🧾</div>Todavía no hay movimientos desde la app</div>`;
  marco('Bitácora', 'Últimos 60 movimientos', h, { back: true });
};

function enlazar() {
  document.querySelectorAll('[data-go]').forEach(el => el.onclick = () => {
    const p = {};
    if (el.dataset.tab) p.tab = el.dataset.tab;
    if (el.dataset.obra) p.obra = el.dataset.obra;
    ir(el.dataset.go, p);
  });
}

// ---------- arranque ----------
async function arrancar() {
  try {
    $app.innerHTML = `<div class="splash"><img src="img/logo-horizontal.png" alt=""><div class="spin"></div></div>`;
    S.yo = await api('yo');
    const st = history.state;
    if (st && st.ruta) { S.ruta = st.ruta; S.params = st.params || {}; } else history.replaceState({ ruta: 'inicio', params: {} }, '');
    pintar();
  } catch (e) {
    if (!/Sesión vencida/.test(e.message)) pantallaLogin(e.message);
  }
}

const t = leerToken();
if (tokenVivo(t)) { S.token = t; arrancar(); }
else pantallaLogin();
})();
