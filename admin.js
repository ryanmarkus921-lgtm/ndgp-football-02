const SUPABASE_URL = "https://kusolnbifqqzswkizwrv.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_w-vSfMlxRmc-nFLiERiOsQ_rNVt4XIZ";
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

let games = [];
let roster = [];

const $ = (id) => document.getElementById(id);

function esc(v){return String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]))}
function dateDisplay(v){return v ? new Intl.DateTimeFormat("en-US",{weekday:"long",month:"long",day:"numeric"}).format(new Date(v+"T12:00:00")):""}

async function loadAdminData(){
  const [g,r,s] = await Promise.all([
    db.from("games").select("*").order("game_date",{ascending:true}),
    db.from("roster").select("*").order("jersey_number",{ascending:true}),
    db.from("app_settings").select("*").eq("id",1).maybeSingle()
  ]);
  if(g.error) throw g.error;
  if(r.error) throw r.error;
  if(s.error) throw s.error;
  games=g.data||[]; roster=r.data||[];
  renderGames(); renderRoster(); renderSettings(s.data);
}

function renderGames(){
  const years = [2026, 2025, 2024];

  $("games-admin").innerHTML=`
    <div class="toolbar">
      <div>
        <p class="eyebrow">Schedule Management</p>
        <h2>Games</h2>
      </div>
      <button id="new-game">ADD GAME</button>
    </div>
    <div id="game-form-wrap"></div>
    <div class="season-dropdowns">
      ${years.map(year => `
        <details class="season-dropdown" ${year === 2026 ? "open" : ""}>
          <summary>
            <span>${year === 2026 ? "2026 SEASON" : `${year} HISTORY`}</span>
            <span class="season-count">${games.filter(g=>Number(g.season)===year).length} games</span>
          </summary>
          <div class="season-games">
            ${renderAdminSeasonGames(year)}
          </div>
        </details>
      `).join("")}
    </div>
  `;

  $("new-game").onclick=()=>showGameForm();

  document.querySelectorAll("[data-edit-game]").forEach(b=>{
    b.onclick=()=>showGameForm(games.find(g=>g.id===b.dataset.editGame));
  });

  document.querySelectorAll("[data-delete-game]").forEach(b=>{
    b.onclick=()=>deleteGame(b.dataset.deleteGame);
  });
}

function renderAdminSeasonGames(year){
  const seasonGames = games
    .filter(g=>Number(g.season)===year)
    .sort((a,b)=>a.game_date.localeCompare(b.game_date));

  if(!seasonGames.length) {
    return `<div class="empty-admin">No games have been added for ${year}.</div>`;
  }

  return seasonGames.map(g=>`
    <div class="admin-row">
      <div>
        <div class="row-title">
          ${g.week ? `Week ${esc(g.week)} • ` : ""}${esc(g.opponent)}
        </div>
        <div class="row-sub">
          ${dateDisplay(g.game_date)}
          ${g.game_time ? " • "+esc(g.game_time) : ""}
          ${g.location ? " • "+esc(g.location) : ""}
        </div>
        <div class="row-sub">
          ${g.status==="completed" && g.our_score!=null
            ? `Final: ${g.our_score}–${g.opponent_score}`
            : g.status.toUpperCase()}
        </div>
      </div>
      <div class="row-actions">
        <button data-edit-game="${g.id}">EDIT</button>
        <button class="danger" data-delete-game="${g.id}">DELETE</button>
      </div>
    </div>
  `).join("");
}

function showGameForm(game=null){
  $("game-form-wrap").innerHTML=`
    <form id="game-form" class="panel" style="padding:16px;margin-bottom:15px">
      <div class="form-grid">
        <label>Season<input name="season" type="number" value="${game?.season||2026}" required></label>
        <label>Week<input name="week" type="number" value="${game?.week||""}"></label>
        <label>Opponent<input name="opponent" value="${esc(game?.opponent||"")}" required></label>
        <label>Date<input name="game_date" type="date" value="${game?.game_date||""}" required></label>
        <label>Time<input name="game_time" value="${esc(game?.game_time||"")}" placeholder="7:00 PM"></label>
        <label>Location<input name="location" value="${esc(game?.location||"")}" placeholder="Lafayette College"></label>
        <label>Home/Away<select name="home_away">
          ${["Home","Away","Neutral"].map(x=>`<option ${game?.home_away===x?"selected":""}>${x}</option>`).join("")}
        </select></label>
        <label>Status<select name="status">${["upcoming","completed","cancelled"].map(x=>`<option ${game?.status===x?"selected":""}>${x}</option>`).join("")}</select></label>
        <label>Our Score<input name="our_score" type="number" value="${game?.our_score??""}"></label>
        <label>Opponent Score<input name="opponent_score" type="number" value="${game?.opponent_score??""}"></label>
        <label class="full">Notes<input name="notes" value="${esc(game?.notes||"")}"></label>
      </div>
      <div style="display:flex;gap:8px;margin-top:14px"><button>${game?"SAVE CHANGES":"CREATE GAME"}</button><button type="button" class="secondary" id="cancel-game">CANCEL</button></div>
    </form>`;
  $("cancel-game").onclick=()=>{$("game-form-wrap").innerHTML=""};
  $("game-form").onsubmit=async e=>{
    e.preventDefault();
    const f=new FormData(e.target), data=Object.fromEntries(f.entries());
    ["season","week","our_score","opponent_score"].forEach(k=>data[k]=data[k]===""?null:Number(data[k]));
    let res=game?await db.from("games").update(data).eq("id",game.id):await db.from("games").insert(data);
    if(res.error)return alert(res.error.message);
    await loadAdminData();
  };
}

async function deleteGame(id){
  if(!confirm("Delete this game?"))return;
  const {error}=await db.from("games").delete().eq("id",id);
  if(error) return alert(error.message);
  await loadAdminData();
}

function renderRoster(){
  $("roster-admin").innerHTML=`
    <div class="toolbar"><h2>Roster</h2><button id="new-player">ADD PLAYER</button></div>
    <div id="player-form-wrap"></div>
    <div class="admin-list">${roster.length?roster.map(p=>`
      <div class="admin-row"><div><div class="row-title">#${esc(p.jersey_number)} • ${esc(p.name)}</div><div class="row-sub">${esc(p.position)} • ${esc(p.grade)}</div></div>
      <div class="row-actions"><button data-edit-player="${p.id}">EDIT</button><button class="danger" data-delete-player="${p.id}">DELETE</button></div></div>`).join(""):`<div class="muted">No players yet.</div>`}</div>`;
  $("new-player").onclick=()=>showPlayerForm();
  document.querySelectorAll("[data-edit-player]").forEach(b=>b.onclick=()=>showPlayerForm(roster.find(p=>p.id===b.dataset.editPlayer)));
  document.querySelectorAll("[data-delete-player]").forEach(b=>b.onclick=()=>deletePlayer(b.dataset.deletePlayer));
}

function showPlayerForm(player=null){
  $("player-form-wrap").innerHTML=`
    <form id="player-form" class="panel" style="padding:16px;margin-bottom:15px">
      <div class="form-grid">
        <label>Name<input name="name" value="${esc(player?.name||"")}" required></label>
        <label>Jersey Number<input name="jersey_number" type="number" value="${player?.jersey_number??""}" required></label>
        <label>Position<input name="position" value="${esc(player?.position||"")}" required></label>
        <label>Grade<input name="grade" value="${esc(player?.grade||"")}" required></label>
        <label>Active<select name="active"><option value="true" ${player?.active!==false?"selected":""}>Yes</option><option value="false" ${player?.active===false?"selected":""}>No</option></select></label>
      </div>
      <div style="display:flex;gap:8px;margin-top:14px"><button>${player?"SAVE CHANGES":"CREATE PLAYER"}</button><button type="button" class="secondary" id="cancel-player">CANCEL</button></div>
    </form>`;
  $("cancel-player").onclick=()=>{$("player-form-wrap").innerHTML=""};
  $("player-form").onsubmit=async e=>{
    e.preventDefault();
    const f=new FormData(e.target), data=Object.fromEntries(f.entries());
    data.jersey_number=Number(data.jersey_number); data.active=data.active==="true";
    const res=player?await db.from("roster").update(data).eq("id",player.id):await db.from("roster").insert(data);
    if(res.error)return alert(res.error.message);
    await loadAdminData();
  };
}

async function deletePlayer(id){
  if(!confirm("Delete this player?"))return;
  const {error}=await db.from("roster").delete().eq("id",id);
  if(error)return alert(error.message);
  await loadAdminData();
}

function renderSettings(settings){
  $("settings-admin").innerHTML=`
    <div class="toolbar"><h2>Settings</h2></div>
    <form id="settings-form" class="panel" style="padding:16px">
      <div class="form-grid">
        <label>App Name<input name="app_name" value="${esc(settings?.app_name||"NDGP Football")}" required></label>
        <label>Instagram<input name="instagram_url" value="${esc(settings?.instagram_url||"")}" required></label>
        <label>X<input name="x_url" value="${esc(settings?.x_url||"")}" required></label>
        <label class="full">Footer Text<input name="managed_by" value="${esc(settings?.managed_by||"Managed by NDGP Football Scores")}" required></label>
      </div>
      <button style="margin-top:14px">SAVE SETTINGS</button>
    </form>`;
  $("settings-form").onsubmit=async e=>{
    e.preventDefault();
    const data=Object.fromEntries(new FormData(e.target).entries());
    const {error}=await db.from("app_settings").update(data).eq("id",1);
    if(error)return alert(error.message);
    alert("Settings saved.");
  };
}

document.querySelectorAll(".admin-tab").forEach(btn=>btn.onclick=()=>{
  document.querySelectorAll(".admin-tab").forEach(x=>x.classList.remove("active"));
  document.querySelectorAll(".admin-section").forEach(x=>x.classList.remove("active"));
  btn.classList.add("active");
  $(btn.dataset.adminTab+"-admin").classList.add("active");
});

$("login-form").onsubmit=async e=>{
  e.preventDefault();
  $("login-error").textContent="";
  const email=$("email").value.trim(), password=$("password").value;
  const {error}=await db.auth.signInWithPassword({email,password});
  if(error){$("login-error").textContent=error.message;return;}
  $("login-panel").classList.add("hidden");
  $("dashboard").classList.remove("hidden");
  loadAdminData().catch(err=>alert(err.message));
};

$("logout").onclick=async()=>{await db.auth.signOut();location.reload();};

db.auth.getSession().then(({data})=>{
  if(data.session){
    $("login-panel").classList.add("hidden");
    $("dashboard").classList.remove("hidden");
    loadAdminData().catch(err=>alert(err.message));
  }
});
