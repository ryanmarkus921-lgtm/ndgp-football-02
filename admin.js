const SUPABASE_URL = "https://kusolnbifqqzswkizwrv.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_w-vSfMlxRmc-nFLiERiOsQ_rNVt4XIZ";
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

let games = [];
let roster = [];
let currentSettings = null;

const $ = (id) => document.getElementById(id);

function esc(v) {
  return String(v ?? "").replace(/[&<>"']/g, m => ({
    "&":"&amp;",
    "<":"&lt;",
    ">":"&gt;",
    '"':"&quot;",
    "'":"&#039;"
  }[m]));
}

function dateDisplay(v) {
  return v
    ? new Intl.DateTimeFormat("en-US", {
        weekday:"long",
        month:"long",
        day:"numeric"
      }).format(new Date(v+"T12:00:00"))
    : "";
}

function shortDate(v) {
  return v
    ? new Intl.DateTimeFormat("en-US", {
        month:"short",
        day:"numeric"
      }).format(new Date(v+"T12:00:00"))
    : "";
}

function getGameDateTime(g) {
  if (!g?.game_date) return null;

  const time = String(g.game_time || "").trim();

  const match = time.match(
    /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i
  );

  if (!match) {
    return new Date(`${g.game_date}T00:00:00`);
  }

  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const period = match[3].toUpperCase();

  if (period === "PM" && hour !== 12) hour += 12;
  if (period === "AM" && hour === 12) hour = 0;

  return new Date(
    `${g.game_date}T${String(hour).padStart(2,"0")}:${String(minute).padStart(2,"0")}:00`
  );
}

function automaticStatus(g) {
  if (!g) return "upcoming";

  if (g.status === "completed") return "completed";
  if (g.status === "cancelled") return "cancelled";
  if (g.status === "live") return "live";

  const gameDate = getGameDateTime(g);

  if (!gameDate) return "upcoming";

  const now = new Date();

  const today = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  );

  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);

  const day = new Date(
    gameDate.getFullYear(),
    gameDate.getMonth(),
    gameDate.getDate()
  );

  if (day.getTime() === today.getTime()) {
    if (now >= gameDate) return "live";
    return "today";
  }

  if (day.getTime() === tomorrow.getTime()) {
    return "tomorrow";
  }

  return "upcoming";
}

function gameResult(g) {
  if (
    g.status !== "completed" ||
    g.our_score == null ||
    g.opponent_score == null
  ) {
    return "upcoming";
  }

  if (Number(g.our_score) > Number(g.opponent_score)) {
    return "win";
  }

  if (Number(g.our_score) < Number(g.opponent_score)) {
    return "loss";
  }

  return "tie";
}

function resultLabel(g) {
  const result = gameResult(g);

  if (result === "win") return "WIN";
  if (result === "loss") return "LOSS";
  if (result === "tie") return "TIE";

  if (g.status === "cancelled") {
    return "CANCELLED";
  }

  if (g.status === "live") {
    return "LIVE";
  }

  const auto = automaticStatus(g);

  if (auto === "today") return "TODAY";
  if (auto === "tomorrow") return "TOMORROW";
  if (auto === "live") return "LIVE";

  return "UPCOMING";
}

function recordFor(gamesIn) {
  let w=0,l=0,t=0;

  gamesIn.forEach(g => {
    const r=gameResult(g);

    if(r==="win") w++;
    else if(r==="loss") l++;
    else if(r==="tie") t++;
  });

  return t
    ? `${w}-${l}-${t}`
    : `${w}-${l}`;
}

async function loadAdminData() {
  const [g,r,s] = await Promise.all([

    db
      .from("games")
      .select("*")
      .order("game_date",{ascending:true}),

    db
      .from("roster")
      .select("*")
      .order("jersey_number",{ascending:true}),

    db
      .from("app_settings")
      .select("*")
      .eq("id",1)
      .maybeSingle()

  ]);

  if(g.error) throw g.error;
  if(r.error) throw r.error;
  if(s.error) throw s.error;

  games=g.data||[];
  roster=r.data||[];
  currentSettings=s.data||null;

  renderDashboard();
  renderGames();
  renderRoster();
  renderSettings(currentSettings);
}

function renderDashboard() {
  const seasonGames =
    games.filter(g => Number(g.season)===2026);

  const completed =
    seasonGames.filter(g => g.status==="completed");

  const next =
    [...seasonGames]
      .filter(g => g.status==="upcoming")
      .sort((a,b) =>
        getGameDateTime(a) - getGameDateTime(b)
      )[0];

  $("admin-stats").innerHTML = `
    <section class="stats-grid">

      <article class="stat-card">
        <span class="stat-label">
          2026 RECORD
        </span>

        <strong>
          ${esc(recordFor(seasonGames))}
        </strong>

        <small>
          ${completed.length} completed
        </small>
      </article>

      <article class="stat-card">

        <span class="stat-label">
          NEXT GAME
        </span>

        <strong class="stat-text">
          ${next ? esc(next.opponent) : "None"}
        </strong>

        <small>
          ${
            next
              ? esc(shortDate(next.game_date))
                + " • "
                + esc(next.game_time||"")
              : "No upcoming game"
          }
        </small>

      </article>

      <article class="stat-card">

        <span class="stat-label">
          ROSTER
        </span>

        <strong>
          ${roster.length}
        </strong>

        <small>
          active players
        </small>

      </article>

    </section>
  `;
}

function renderGames() {
  const years=[2026,2025,2024];

  $("games-admin").innerHTML=`

    <div class="toolbar">

      <div>
        <p class="eyebrow">
          Schedule Management
        </p>

        <h2>
          Games
        </h2>
      </div>

      <button id="new-game">
        ADD GAME
      </button>

    </div>

    <div id="game-form-wrap"></div>

    <div class="season-dropdowns">

      ${years.map(year=>`

        <details
          class="season-dropdown"
          ${year===2026?"open":""}
        >

          <summary>
            <span>
              ${
                year===2026
                  ? "2026 SEASON"
                  : `${year} HISTORY`
              }
            </span>

            <span class="season-count">
              ${
                games.filter(
                  g => Number(g.season)===year
                ).length
              }
              games
            </span>
          </summary>

          <div class="season-games">
            ${renderAdminSeasonGames(year)}
          </div>

        </details>

      `).join("")}

    </div>
  `;

  $("new-game").onclick=()=>showGameForm();

  document
    .querySelectorAll("[data-edit-game]")
    .forEach(b =>
      b.onclick=() =>
        showGameForm(
          games.find(g=>g.id===b.dataset.editGame)
        )
    );

  document
    .querySelectorAll("[data-delete-game]")
    .forEach(b =>
      b.onclick=() =>
        deleteGame(b.dataset.deleteGame)
    );

  document
    .querySelectorAll("[data-quick-game]")
    .forEach(b =>
      b.onclick=() =>
        showQuickScore(
          games.find(g=>g.id===b.dataset.quickGame)
        )
    );
}

function renderAdminSeasonGames(year) {

  const seasonGames =
    games
      .filter(g=>Number(g.season)===year)
      .sort((a,b)=>
        a.game_date.localeCompare(b.game_date)
      );

  if(!seasonGames.length) {
    return `
      <div class="empty-admin">
        No games have been added for ${year}.
      </div>
    `;
  }

  return seasonGames.map(g=>`

    <div class="admin-row">

      <div>

        <div class="row-title">
          ${g.week?`Week ${esc(g.week)} • `:""}
          ${esc(g.opponent)}
        </div>

        <div class="row-sub">
          ${dateDisplay(g.game_date)}
          ${g.game_time?" • "+esc(g.game_time):""}
          ${g.location?" • "+esc(g.location):""}
        </div>

        <div class="row-sub">

          <span
            class="status-pill ${gameResult(g)}"
          >
            ${esc(resultLabel(g))}
          </span>

          ${
            g.status==="completed" &&
            g.our_score!=null
              ? ` <b>${g.our_score}–${g.opponent_score}</b>`
              : ""
          }

        </div>

      </div>

      <div class="row-actions">

        <button data-quick-game="${g.id}">
          SCORE
        </button>

        <button data-edit-game="${g.id}">
          EDIT
        </button>

        <button
          class="danger"
          data-delete-game="${g.id}"
        >
          DELETE
        </button>

      </div>

    </div>

  `).join("");
}

function showQuickScore(game) {

  $("game-form-wrap").innerHTML=`

    <form
      id="quick-score-form"
      class="panel quick-score-panel"
    >

      <div class="quick-score-head">

        <div>

          <p class="eyebrow">
            Game Day
          </p>

          <h3>
            Notre Dame vs ${esc(game.opponent)}
          </h3>

          <p class="muted">
            ${dateDisplay(game.game_date)}
            ${game.game_time?" • "+esc(game.game_time):""}
          </p>

        </div>

        <button
          type="button"
          class="secondary"
          id="close-score"
        >
          CLOSE
        </button>

      </div>

      <div class="score-inputs">

        <label>
          Notre Dame
          <input
            name="our_score"
            type="number"
            min="0"
            inputmode="numeric"
            value="${game.our_score??""}"
            required
          >
        </label>

        <div class="score-dash">
          –
        </div>

        <label>
          ${esc(game.opponent)}
          <input
            name="opponent_score"
            type="number"
            min="0"
            inputmode="numeric"
            value="${game.opponent_score??""}"
            required
          >
        </label>

      </div>

      <div class="quick-actions">

        <button type="submit">
          SAVE FINAL
        </button>

        <button
          type="button"
          class="secondary"
          id="save-score"
        >
          SAVE SCORE ONLY
        </button>

      </div>

      <div
        id="quick-score-msg"
        class="muted"
      ></div>

    </form>
  `;

  $("close-score").onclick=() => {
    $("game-form-wrap").innerHTML="";
  };

  $("quick-score-form").onsubmit=async e=>{
    e.preventDefault();

    await updateScore(
      game.id,
      new FormData(e.target),
      "completed"
    );
  };

  $("save-score").onclick=async()=>{
    await updateScore(
      game.id,
      new FormData($("quick-score-form")),
      "upcoming"
    );
  };
}

async function updateScore(id,form,status) {

  const our=Number(form.get("our_score"));
  const opp=Number(form.get("opponent_score"));

  if(
    !Number.isFinite(our) ||
    !Number.isFinite(opp) ||
    our<0 ||
    opp<0
  ) {
    return alert("Enter valid scores.");
  }

  const {error}=await db
    .from("games")
    .update({
      our_score:our,
      opponent_score:opp,
      status
    })
    .eq("id",id);

  if(error) {
    return alert(error.message);
  }

  await loadAdminData();
}

function showGameForm(game=null) {

  $("game-form-wrap").innerHTML=`

    <form
      id="game-form"
      class="panel form-panel"
    >

      <div class="toolbar">

        <div>

          <p class="eyebrow">
            ${game?"Edit Game":"New Game"}
          </p>

          <h3>
            ${game?"Update Game":"Add Game"}
          </h3>

        </div>

        <button
          type="button"
          class="secondary"
          id="cancel-game"
        >
          CANCEL
        </button>

      </div>

      <div class="form-grid">

        <label>
          Season
          <input
            name="season"
            type="number"
            value="${game?.season||2026}"
            required
          >
        </label>

        <label>
          Week
          <input
            name="week"
            type="number"
            value="${game?.week||""}"
          >
        </label>

        <label>
          Opponent
          <input
            name="opponent"
            value="${esc(game?.opponent||"")}"
            required
          >
        </label>

        <label>
          Date
          <input
            name="game_date"
            type="date"
            value="${game?.game_date||""}"
            required
          >
        </label>

        <label>
          Time
          <input
            name="game_time"
            value="${esc(game?.game_time||"")}"
            placeholder="7:00 PM"
          >
        </label>

        <label>
          Location
          <input
            name="location"
            value="${esc(game?.location||"")}"
            placeholder="Lafayette College"
          >
        </label>

        <label>
          Home/Away
          <select name="home_away">

            ${["Home","Away","Neutral"]
              .map(x=>`
                <option
                  ${game?.home_away===x?"selected":""}
                >
                  ${x}
                </option>
              `)
              .join("")}

          </select>
        </label>

        <label>
          Status
          <select name="status">

            <option
              value="upcoming"
              ${!game || game?.status==="upcoming"?"selected":""}
            >
              Automatic
            </option>

            <option
              value="live"
              ${game?.status==="live"?"selected":""}
            >
              Live (Manual)
            </option>

            <option
              value="completed"
              ${game?.status==="completed"?"selected":""}
            >
              Completed
            </option>

            <option
              value="cancelled"
              ${game?.status==="cancelled"?"selected":""}
            >
              Cancelled
            </option>

          </select>
        </label>

        <label>
          Notre Dame Score
          <input
            name="our_score"
            type="number"
            min="0"
            value="${game?.our_score??""}"
          >
        </label>

        <label>
          Opponent Score
          <input
            name="opponent_score"
            type="number"
            min="0"
            value="${game?.opponent_score??""}"
          >
        </label>

        <label class="full">
          Notes
          <input
            name="notes"
            value="${esc(game?.notes||"")}"
          />
        </label>

      </div>

      <button style="margin-top:14px">
        ${game?"SAVE CHANGES":"CREATE GAME"}
      </button>

    </form>
  `;

  $("cancel-game").onclick=()=>{
    $("game-form-wrap").innerHTML="";
  };

  $("game-form").onsubmit=async e=>{

    e.preventDefault();

    const f = new FormData(e.target);
const data = Object.fromEntries(f.entries());

data.show_tickets = e.target.elements.show_tickets.checked;

    ["season","week","our_score","opponent_score"]
      .forEach(k=>{
        data[k]=
          data[k]===""
            ? null
            : Number(data[k]);
      });

    const res =
      game
        ? await db
            .from("games")
            .update(data)
            .eq("id",game.id)
        : await db
            .from("games")
            .insert(data);

    if(res.error) {
      return alert(res.error.message);
    }

    await loadAdminData();
  };
}

async function deleteGame(id) {

  if(
    !confirm(
      "Delete this game? This cannot be undone."
    )
  ) {
    return;
  }

  const {error}=await db
    .from("games")
    .delete()
    .eq("id",id);

  if(error) {
    return alert(error.message);
  }

  await loadAdminData();
}

function renderRoster() {

  $("roster-admin").innerHTML=`

    <div class="toolbar">

      <div>
        <p class="eyebrow">
          Player Management
        </p>

        <h2>
          Roster
        </h2>
      </div>

      <button id="new-player">
        ADD PLAYER
      </button>

    </div>

    <div class="roster-tools">
      <input
        id="roster-search"
        placeholder="Search by name or number"
      >
    </div>

    <div id="player-form-wrap"></div>

    <div
      id="roster-list"
      class="admin-list"
    ></div>
  `;

  $("new-player").onclick=()=>showPlayerForm();

  $("roster-search").oninput=e=>
    drawRosterList(e.target.value);

  drawRosterList("");
}

function drawRosterList(query) {

  const q=query.trim().toLowerCase();

  const players=
    roster.filter(p=>
      `${p.name} ${p.jersey_number} ${p.position} ${p.grade}`
        .toLowerCase()
        .includes(q)
    );

  $("roster-list").innerHTML=
    players.length
      ? players.map(p=>`

        <div class="admin-row">

          <div>

            <div class="row-title">
              #${esc(p.jersey_number)}
              •
              ${esc(p.name)}
            </div>

            <div class="row-sub">
              ${esc(p.position)}
              •
              ${esc(p.grade)}
              ${p.active===false?" • INACTIVE":""}
            </div>

          </div>

          <div class="row-actions">

            <button
              data-edit-player="${p.id}"
            >
              EDIT
            </button>

            <button
              class="danger"
              data-delete-player="${p.id}"
            >
              DELETE
            </button>

          </div>

        </div>

      `).join("")
      : `
        <div class="empty-admin">
          No players match your search.
        </div>
      `;

  document
    .querySelectorAll("[data-edit-player]")
    .forEach(b=>
      b.onclick=()=>
        showPlayerForm(
          roster.find(
            p=>p.id===b.dataset.editPlayer
          )
        )
    );

  document
    .querySelectorAll("[data-delete-player]")
    .forEach(b=>
      b.onclick=()=>
        deletePlayer(
          b.dataset.deletePlayer
        )
    );
}

function showPlayerForm(player=null) {

  $("player-form-wrap").innerHTML=`

    <form
      id="player-form"
      class="panel form-panel"
    >

      <div class="toolbar">

        <div>

          <p class="eyebrow">
            ${player?"Edit Player":"New Player"}
          </p>

          <h3>
            ${player?"Update Player":"Add Player"}
          </h3>

        </div>

        <button
          type="button"
          class="secondary"
          id="cancel-player"
        >
          CANCEL
        </button>

      </div>

      <div class="form-grid">

        <label>
          Name
          <input
            name="name"
            value="${esc(player?.name||"")}"
            required
          >
        </label>

        <label>
          Jersey Number
          <input
            name="jersey_number"
            type="number"
            min="0"
            value="${player?.jersey_number??""}"
            required
          >
        </label>

        <label>
          Position
          <input
            name="position"
            value="${esc(player?.position||"")}"
            required
          >
        </label>

        <label>
          Grade
          <input
            name="grade"
            value="${esc(player?.grade||"")}"
            required
          >
        </label>

        <label>
          Active

          <select name="active">

            <option
              value="true"
              ${player?.active!==false?"selected":""}
            >
              Yes
            </option>

            <option
              value="false"
              ${player?.active===false?"selected":""}
            >
              No
            </option>

          </select>

        </label>

      </div>

      <button style="margin-top:14px">
        ${player?"SAVE CHANGES":"CREATE PLAYER"}
      </button>

    </form>
  `;

  $("cancel-player").onclick=()=>{
    $("player-form-wrap").innerHTML="";
  };

  $("player-form").onsubmit=async e=>{

    e.preventDefault();

    const f=new FormData(e.target);
    const data=Object.fromEntries(f.entries());

    data.jersey_number=
      Number(data.jersey_number);

    data.active=
      data.active==="true";

    const res=
      player
        ? await db
            .from("roster")
            .update(data)
            .eq("id",player.id)
        : await db
            .from("roster")
            .insert(data);

    if(res.error) {
      return alert(res.error.message);
    }

    await loadAdminData();
  };
}

async function deletePlayer(id) {

  if(
    !confirm(
      "Delete this player? This cannot be undone."
    )
  ) {
    return;
  }

  const {error}=await db
    .from("roster")
    .delete()
    .eq("id",id);

  if(error) {
    return alert(error.message);
  }

  await loadAdminData();
}

function renderSettings(settings) {

  $("settings-admin").innerHTML=`

    <div class="toolbar">

      <div>

        <p class="eyebrow">
          App Configuration
        </p>

        <h2>
          Settings
        </h2>

      </div>

    </div>

    <form
      id="settings-form"
      class="panel form-panel"
    >

      <div class="form-grid">

        <label>
          App Name
          <input
            name="app_name"
            value="${esc(
              settings?.app_name ||
              "NDGP Football"
            )}"
            required
          >
        </label>

        <label>
          Ticket Link
          <input
            name="ticket_url"
            type="url"
            value="${esc(
              settings?.ticket_url||""
            )}"
            placeholder="https://..."
            required
          >
        </label>
        <label class="toggle-setting">
  <span>Show Buy Tickets Box</span>
  <input
    type="checkbox"
    name="show_tickets"
    ${settings?.show_tickets !== false ? "checked" : ""}
  >
</label>

        <label>
          Instagram
          <input
            name="instagram_url"
            value="${esc(
              settings?.instagram_url||""
            )}"
            required
          >
        </label>

        <label>
          X
          <input
            name="x_url"
            value="${esc(
              settings?.x_url||""
            )}"
            required
          >
        </label>

        <label class="full">
          Footer Text
          <input
            name="managed_by"
            value="${esc(
              settings?.managed_by ||
              "Managed by NDGP Football Scores"
            )}"
            required
          >
        </label>

      </div>

      <button style="margin-top:14px">
        SAVE SETTINGS
      </button>

    </form>
  `;

  $("settings-form").onsubmit=async e=>{

    e.preventDefault();

    const data = Object.fromEntries(new FormData(e.target).entries());
data.show_tickets = e.target.elements.show_tickets.checked;

const {error} = await db.from("app_settings").update(data).eq("id",1);

    if(error) {
      return alert(error.message);
    }

    alert("Settings saved.");
  };
}

document
  .querySelectorAll(".admin-tab")
  .forEach(btn=>
    btn.onclick=()=>{

      document
        .querySelectorAll(".admin-tab")
        .forEach(x=>
          x.classList.remove("active")
        );

      document
        .querySelectorAll(".admin-section")
        .forEach(x=>
          x.classList.remove("active")
        );

      btn.classList.add("active");

      $(
        btn.dataset.adminTab+"-admin"
      ).classList.add("active");

    }
  );

$("login-form").onsubmit=async e=>{

  e.preventDefault();

  $("login-error").textContent="";

  const email=
    $("email").value.trim();

  const password=
    $("password").value;

  const {error}=
    await db.auth.signInWithPassword({
      email,
      password
    });

  if(error) {
    $("login-error").textContent=
      error.message;

    return;
  }

  $("login-panel").classList.add("hidden");
  $("dashboard").classList.remove("hidden");

  loadAdminData()
    .catch(err=>alert(err.message));
};

$("logout").onclick=async()=>{
  await db.auth.signOut();
  location.reload();
};

db.auth.getSession().then(({data})=>{

  if(data.session) {

    $("login-panel").classList.add("hidden");
    $("dashboard").classList.remove("hidden");

    loadAdminData()
      .catch(err=>alert(err.message));
  }

});
