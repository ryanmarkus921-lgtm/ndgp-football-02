const SUPABASE_URL = "https://kusolnbifqqzswkizwrv.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_w-vSfMlxRmc-nFLiERiOsQ_rNVt4XIZ";
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

const state = {
  games: [],
  roster: [],
  settings: null,
  page: "home"
};

const $ = (id) => document.getElementById(id);

let countdownTimer = null;

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (m) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[m]));
}

function formatDate(dateString) {
  if (!dateString) return "";

  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric"
  }).format(new Date(`${dateString}T12:00:00`));
}

/*
  Converts the database game date + time into a real Date.

  Expected game_time examples:
  7:00 PM
  7:30 PM
  6:00 PM
*/
function getGameDateTime(game) {
  if (!game?.game_date) return null;

  const time = String(game.game_time || "").trim();

  if (!time) {
    return new Date(`${game.game_date}T00:00:00`);
  }

  const match = time.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);

  if (!match) {
    return new Date(`${game.game_date}T00:00:00`);
  }

  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const period = match[3].toUpperCase();

  if (period === "PM" && hour !== 12) hour += 12;
  if (period === "AM" && hour === 12) hour = 0;

  return new Date(
    `${game.game_date}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`
  );
}

/*
  Automatically determines whether a game is:
  - TODAY
  - TOMORROW
  - or its normal date
*/
function gameDateLabel(game) {
  if (!game?.game_date) return "";

  const gameDate = new Date(`${game.game_date}T00:00:00`);

  const now = new Date();

  const today = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  );

  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);

  if (gameDate.getTime() === today.getTime()) {
    return "TODAY";
  }

  if (gameDate.getTime() === tomorrow.getTime()) {
    return "TOMORROW";
  }

  return formatDate(game.game_date);
}

function gameDateLine(game) {
  const date = gameDateLabel(game);
  const time = game.game_time ? ` - ${game.game_time}` : "";
  const place = game.location ? ` at ${game.location}` : "";

  return `${date}${time}${place}`;
}

function getResult(game) {
  if (game.status !== "completed") return "upcoming";

  if (game.our_score == null || game.opponent_score == null) {
    return "upcoming";
  }

  if (game.our_score > game.opponent_score) return "win";
  if (game.our_score < game.opponent_score) return "loss";

  return "tie";
}

function resultText(game) {
  const r = getResult(game);

  if (r === "win") return "WIN";
  if (r === "loss") return "LOSS";
  if (r === "tie") return "TIE";

  if (game.status === "cancelled") {
    return "CANCELLED";
  }

  return "UPCOMING";
}

function formatCountdown(milliseconds) {
  if (milliseconds <= 0) return "00:00:00";

  const totalSeconds = Math.floor(milliseconds / 1000);

  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) {
    return `${days}d ${String(hours).padStart(2, "0")}h ${String(minutes).padStart(2, "0")}m`;
  }

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function isGameLive(game) {
  if (!game) return false;

  if (game.status === "completed" || game.status === "cancelled") {
    return false;
  }

  const kickoff = getGameDateTime(game);

  if (!kickoff) return false;

  return new Date() >= kickoff;
}

function updateCountdown() {
  const upcoming = [...state.games]
    .filter(g => g.status === "upcoming")
    .sort((a, b) => {
      const aDate = getGameDateTime(a)?.getTime() || 0;
      const bDate = getGameDateTime(b)?.getTime() || 0;

      return aDate - bDate;
    })[0];

  const countdown = $("game-countdown");
  const live = $("game-live");

  if (!countdown || !live) return;

  if (!upcoming) {
    countdown.style.display = "none";
    live.style.display = "none";
    return;
  }

  if (isGameLive(upcoming)) {
    countdown.style.display = "none";
    live.style.display = "inline-flex";
    live.textContent = "● LIVE";
    return;
  }

  const kickoff = getGameDateTime(upcoming);

  if (!kickoff) {
    countdown.style.display = "none";
    live.style.display = "none";
    return;
  }

  const remaining = kickoff.getTime() - Date.now();

  if (remaining <= 0) {
    countdown.style.display = "none";
    live.style.display = "inline-flex";
    live.textContent = "● LIVE";
    return;
  }

  live.style.display = "none";
  countdown.style.display = "inline-flex";

  countdown.textContent = `Starts in ${formatCountdown(remaining)}`;
}

function startCountdown() {
  if (countdownTimer) {
    clearInterval(countdownTimer);
  }

  updateCountdown();

  countdownTimer = setInterval(updateCountdown, 1000);
}

function gameCard(game) {
  const result = getResult(game);

  const score =
    game.status === "completed" &&
    game.our_score != null &&
    game.opponent_score != null
      ? `${game.our_score}–${game.opponent_score}`
      : "—";

  return `
    <article class="game-card">
      <div class="week">
        ${game.week ? `Week ${game.week}` : "Game"}
      </div>

      <div class="game-main">
        <div class="game-opponent">
          Notre Dame vs ${escapeHtml(game.opponent)}
        </div>

        <div class="game-info">
          ${escapeHtml(gameDateLine(game))}
        </div>
      </div>

      <div class="game-score">
        <div class="score">${score}</div>
        <div class="result ${result}">
          ${resultText(game)}
        </div>
      </div>
    </article>
  `;
}

function renderHome() {
  const seasonGames = state.games.filter(
    g => Number(g.season) === 2026
  );

  const record = seasonRecord(seasonGames);

  const upcoming = [...state.games]
    .filter(g => g.status === "upcoming")
    .sort((a, b) => {
      const aDate = getGameDateTime(a)?.getTime() || 0;
      const bDate = getGameDateTime(b)?.getTime() || 0;

      return aDate - bDate;
    })[0];

  const ticketUrl =
    state.settings?.ticket_url ||
    "https://fan.hudl.com/usa/pa/easton/organization/19428/notre-dame-green-high-school/tickets";

  $("home-page").innerHTML = `
    <div class="hero-grid">

      <section class="next-card">
        <div class="eyebrow">Next Game</div>

        ${
          upcoming
            ? `
              <div class="matchup">

                <div class="team">
                  Notre Dame
                </div>

                <div class="vs">
                  VS
                </div>

                <div class="team away">
                  ${escapeHtml(upcoming.opponent)}
                </div>

              </div>

              <div class="next-meta">

                ${escapeHtml(gameDateLabel(upcoming))}
                ${upcoming.game_time ? ` - ${escapeHtml(upcoming.game_time)}` : ""}

                <div class="location">
                  ${
                    upcoming.location
                      ? `at ${escapeHtml(upcoming.location)}`
                      : ""
                  }
                </div>

                <div class="game-status-area">

                  <span
                    id="game-countdown"
                    class="game-countdown"
                  ></span>

                  <span
                    id="game-live"
                    class="game-live"
                    style="display:none"
                  >
                    ● LIVE
                  </span>

                </div>

              </div>
            `
            : `
              <div class="empty" style="margin-top:28px">
                No upcoming game has been added yet.
              </div>
            `
        }
      </section>

      <a
        class="ticket-card"
        href="${escapeHtml(ticketUrl)}"
        target="_blank"
        rel="noopener"
      >

        <div class="eyebrow">
          Tickets
        </div>

        <div class="ticket-title">
          BUY<br>TICKETS
        </div>

        <div class="ticket-description">
          Get your tickets for the next game.
        </div>

        <div class="ticket-action">
          BUY NOW →
        </div>

      </a>

    </div>
  `;

  startCountdown();
}

function renderSchedule() {
  const seasonGames = state.games
    .filter(g => Number(g.season) === 2026)
    .sort((a, b) => a.game_date.localeCompare(b.game_date));

  $("schedule-page").innerHTML = `
    <div class="page-heading">
      <div>
        <div class="eyebrow">
          Notre Dame Green Pond
        </div>

        <h2>
          Schedule
        </h2>
      </div>
    </div>

    <div class="schedule-season-header">
      <div class="season-label">
        2026 Season
      </div>
    </div>

    <div class="game-list">
      ${
        seasonGames.length
          ? seasonGames.map(gameCard).join("")
          : `
            <div class="empty">
              No 2026 games have been added yet.
            </div>
          `
      }
    </div>
  `;
}

function renderRoster() {
  const players = [...state.roster]
    .filter(p => p.active !== false)
    .sort(
      (a, b) =>
        Number(a.jersey_number) -
        Number(b.jersey_number)
    );

  $("roster-page").innerHTML = `
    <div class="page-heading">
      <div>
        <div class="eyebrow">
          Notre Dame Green Pond
        </div>

        <h2>
          Roster
        </h2>
      </div>
    </div>

    <div class="roster-grid">

      ${
        players.length
          ? players
              .map(
                p => `
                  <article class="player-card">

                    <div class="jersey">
                      #${escapeHtml(p.jersey_number)}
                    </div>

                    <div>

                      <div class="player-name">
                        ${escapeHtml(p.name)}
                      </div>

                      <div class="player-meta">
                        ${escapeHtml(p.position)}
                        •
                        ${escapeHtml(p.grade)}
                      </div>

                    </div>

                  </article>
                `
              )
              .join("")
          : `
            <div
              class="empty"
              style="grid-column:1/-1"
            >
              No roster players have been added yet.
            </div>
          `
      }

    </div>
  `;
}

function seasonRecord(games) {
  let wins = 0;
  let losses = 0;
  let ties = 0;

  games.forEach(g => {
    const r = getResult(g);

    if (r === "win") wins++;
    else if (r === "loss") losses++;
    else if (r === "tie") ties++;
  });

  return ties
    ? `${wins}-${losses}-${ties}`
    : `${wins}-${losses}`;
}

function renderHistory() {
  const years = [2025, 2024];

  $("history-page").innerHTML = `
    <div class="page-heading">
      <div>
        <div class="eyebrow">
          Previous Seasons
        </div>

        <h2>
          History
        </h2>
      </div>
    </div>

    ${years
      .map(year => {
        const games = state.games
          .filter(g => Number(g.season) === year)
          .sort((a, b) =>
            a.game_date.localeCompare(b.game_date)
          );

        return `
          <div class="season-label">
            ${year} • ${seasonRecord(games)}
          </div>

          <div class="game-list">
            ${
              games.length
                ? games.map(gameCard).join("")
                : `
                  <div class="empty">
                    No ${year} games have been added yet.
                  </div>
                `
            }
          </div>
        `;
      })
      .join("")}
  `;
}

function switchPage(page) {
  state.page = page;

  document
    .querySelectorAll(".view")
    .forEach(v => v.classList.remove("active"));

  const target = document.querySelector(`#${page}-page`);

  if (target) {
    target.classList.add("active");
  }

  document
    .querySelectorAll(".nav-item")
    .forEach(btn => {
      btn.classList.toggle(
        "active",
        btn.dataset.page === page
      );
    });

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });
}

async function loadData() {
  const [
    gamesRes,
    rosterRes,
    settingsRes
  ] = await Promise.all([
    db
      .from("games")
      .select("*")
      .order("game_date", {
        ascending: true
      }),

    db
      .from("roster")
      .select("*")
      .order("jersey_number", {
        ascending: true
      }),

    db
      .from("app_settings")
      .select("*")
      .eq("id", 1)
      .maybeSingle()
  ]);

  if (gamesRes.error) {
    throw gamesRes.error;
  }

  if (rosterRes.error) {
    throw rosterRes.error;
  }

  if (settingsRes.error) {
    throw settingsRes.error;
  }

  state.games = gamesRes.data || [];
  state.roster = rosterRes.data || [];
  state.settings = settingsRes.data || null;

  const seasonGames = state.games.filter(
    g => Number(g.season) === 2026
  );

  const record = seasonRecord(seasonGames);

  const headerRecord =
    document.getElementById("header-record");

  if (headerRecord) {
    headerRecord.textContent = record;
  }

  renderHome();
  renderSchedule();
  renderRoster();
  renderHistory();
}

document
  .querySelectorAll(".nav-item")
  .forEach(btn => {
    btn.addEventListener("click", () => {
      switchPage(btn.dataset.page);
    });
  });

loadData().catch(err => {
  console.error(err);

  $("home-page").innerHTML = `
    <div
      class="empty"
      style="margin-top:30px"
    >
      <strong>
        Unable to load NDGP Football.
      </strong>

      <br>

      Please check the Supabase connection
      and try again.
    </div>
  `;
});
