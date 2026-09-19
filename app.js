const SUPABASE_URL = "https://kusolnbifqqzswkizwrv.supabase.co";
const SUPABASE_PUBLISHABLE_KEY =
  "sb_publishable_w-vSfMlxRmc-nFLiERiOsQ_rNVt4XIZ";

const db = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY
);

const state = {
  games: [],
  roster: [],
  settings: null,
  page: "home",
  countdownTimer: null,
  matchupObserver: null
};

const $ = (id) => document.getElementById(id);


/* =========================================================
   GENERAL HELPERS
   ========================================================= */

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


function gameDateLine(game) {
  const date = formatDate(game.game_date);
  const time = game.game_time ? ` - ${game.game_time}` : "";
  const place = game.location ? ` at ${game.location}` : "";

  return `${date}${time}${place}`;
}


/* =========================================================
   GAME STATUS / RESULTS
   ========================================================= */

function getResult(game) {
  if (game.status !== "completed") return "upcoming";

  if (
    game.our_score == null ||
    game.opponent_score == null
  ) {
    return "upcoming";
  }

  if (Number(game.our_score) > Number(game.opponent_score)) {
    return "win";
  }

  if (Number(game.our_score) < Number(game.opponent_score)) {
    return "loss";
  }

  return "tie";
}


function resultText(game) {
  const result = getResult(game);

  if (result === "win") return "WIN";
  if (result === "loss") return "LOSS";
  if (result === "tie") return "TIE";

  if (game.status === "cancelled") {
    return "CANCELLED";
  }

  const automaticStatus = automaticGameStatus(game);

  if (automaticStatus === "live") return "LIVE";
  if (automaticStatus === "today") return "TODAY";
  if (automaticStatus === "tomorrow") return "TOMORROW";

  return "UPCOMING";
}


function getGameDateTime(game) {
  if (!game?.game_date) return null;

  const time = String(game.game_time || "").trim();

  const match = time.match(
    /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i
  );

  if (!match) {
    return new Date(`${game.game_date}T00:00:00`);
  }

  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const period = match[3].toUpperCase();

  if (period === "PM" && hour !== 12) {
    hour += 12;
  }

  if (period === "AM" && hour === 12) {
    hour = 0;
  }

  return new Date(
    `${game.game_date}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`
  );
}


function automaticGameStatus(game) {
  if (!game || !game.game_date) {
    return "upcoming";
  }

  // Manual overrides
  if (game.status === "completed") {
    return "completed";
  }

  if (game.status === "cancelled") {
    return "cancelled";
  }

  if (game.status === "live") {
    return "live";
  }

  const gameDate = getGameDateTime(game);

  if (!gameDate) {
    return "upcoming";
  }

  const now = new Date();

  const today = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  );

  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);

  const gameDay = new Date(
    gameDate.getFullYear(),
    gameDate.getMonth(),
    gameDate.getDate()
  );

  if (gameDay.getTime() === today.getTime()) {
    if (now >= gameDate) {
      return "live";
    }

    return "today";
  }

  if (gameDay.getTime() === tomorrow.getTime()) {
    return "tomorrow";
  }

  return "upcoming";
}


/* =========================================================
   GAME CARD
   ========================================================= */

function gameCard(game) {
  const result = getResult(game);
  const automaticStatus = automaticGameStatus(game);

  const score =
    game.status === "completed" &&
    game.our_score != null &&
    game.opponent_score != null
      ? `${game.our_score}–${game.opponent_score}`
      : "—";

  return `
    <article class="game-card">

      <div class="week">
        ${game.week ? `Week ${escapeHtml(game.week)}` : "Game"}
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

        <div class="score">
          ${score}
        </div>

        <div class="result ${result} status-${automaticStatus}">
          ${resultText(game)}
        </div>

      </div>

    </article>
  `;
}


/* =========================================================
   NEXT GAME OPPONENT FONT FITTING
   ========================================================= */

/*
  This is intentionally based on the actual rendered width
  instead of the number of letters in the opponent's name.

  That means:

  CATASAUQUA
  NORTH SCHUYLKILL
  SOUTHERN LEHIGH
  NORTHWESTERN LEHIGH

  can all automatically receive different font sizes.
*/

function fitOpponentName() {
  const matchup = document.querySelector(".matchup");
  const opponent = document.querySelector(".matchup .away-team");

  if (!matchup || !opponent) {
    return;
  }

  const screenWidth = window.innerWidth;

  let maxSize;

  if (screenWidth <= 480) {
    maxSize = 44;
  } else if (screenWidth <= 720) {
    maxSize = 50;
  } else {
    maxSize = 58;
  }

  const minSize = 20;

  opponent.style.setProperty(
    "--opponent-size",
    `${maxSize}px`
  );

  opponent.style.fontSize = `${maxSize}px`;

  let size = maxSize;

  /*
    Keep shrinking until the actual rendered text fits
    inside its grid column.
  */
  while (
    opponent.scrollWidth > opponent.clientWidth &&
    size > minSize
  ) {
    size -= 1;

    opponent.style.fontSize = `${size}px`;

    opponent.style.setProperty(
      "--opponent-size",
      `${size}px`
    );
  }

  /*
    If the browser hasn't finished calculating layout yet,
    check again on the next frame.
  */
  requestAnimationFrame(() => {
    if (!document.body.contains(opponent)) {
      return;
    }

    let currentSize = parseFloat(
      getComputedStyle(opponent).fontSize
    );

    if (!Number.isFinite(currentSize)) {
      currentSize = size;
    }

    while (
      opponent.scrollWidth > opponent.clientWidth &&
      currentSize > minSize
    ) {
      currentSize -= 1;

      opponent.style.fontSize = `${currentSize}px`;

      opponent.style.setProperty(
        "--opponent-size",
        `${currentSize}px`
      );
    }
  });
}


/*
  Watches the matchup itself.

  This catches changes caused by:
  - browser resizing
  - phone rotation
  - different screen sizes
  - layout changes
  - sidebar/window changes
*/
function setupMatchupObserver() {
  if (state.matchupObserver) {
    state.matchupObserver.disconnect();
    state.matchupObserver = null;
  }

  const matchup = document.querySelector(".matchup");

  if (!matchup || !window.ResizeObserver) {
    fitOpponentName();
    return;
  }

  state.matchupObserver = new ResizeObserver(() => {
    fitOpponentName();
  });

  state.matchupObserver.observe(matchup);

  fitOpponentName();
}


/* =========================================================
   HOME PAGE
   ========================================================= */

function renderHome() {
  const seasonGames = state.games.filter(
    (game) => Number(game.season) === 2026
  );

  const record = seasonRecord(seasonGames);

  const upcoming = [...state.games]
    .filter((game) => game.status === "upcoming")
    .sort((a, b) =>
      `${a.game_date} ${a.game_time || ""}`.localeCompare(
        `${b.game_date} ${b.game_time || ""}`
      )
    )[0];

  const ticketUrl =
    state.settings?.ticket_url ||
    "https://fan.hudl.com/usa/pa/easton/organization/19428/notre-dame-green-high-school/tickets";

  /*
    Show the Tickets box unless the Admin setting is
    explicitly OFF.
  */
  const showTickets =
    state.settings?.show_tickets !== false &&
    state.settings?.show_tickets !== "false";

  $("home-page").innerHTML = `
    <div class="hero-grid">

      <section class="next-card">

        <div class="eyebrow">
          Next Game
        </div>

        ${
          upcoming
            ? `

          <div class="matchup">

            <div class="team home-team">
              Notre Dame
            </div>

            <div class="vs">
              VS
            </div>

            <div class="team away-team">
              ${escapeHtml(upcoming.opponent)}
            </div>

          </div>

          <div class="next-meta">

            ${escapeHtml(formatDate(upcoming.game_date))}
            - ${escapeHtml(upcoming.game_time || "")}

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
                style="display:none;"
              >
                ● LIVE
              </span>

            </div>

          </div>

        `
            : `

          <div
            class="empty"
            style="margin-top:28px"
          >
            No upcoming game has been added yet.
          </div>

        `
        }

      </section>

      ${
        showTickets
          ? `

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

      `
          : ""
      }

    </div>
  `;

  /*
    Make the opponent name fit immediately after
    the Home page has been rendered.
  */
  if (upcoming) {
    setupMatchupObserver();
    startGameCountdown(upcoming);
  }
}


/* =========================================================
   SCHEDULE
   ========================================================= */

function renderSchedule() {
  const seasonGames = state.games
    .filter((game) => Number(game.season) === 2026)
    .sort((a, b) =>
      a.game_date.localeCompare(b.game_date)
    );

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


/* =========================================================
   ROSTER
   ========================================================= */

function renderRoster() {
  const players = [...state.roster]
    .filter((player) => player.active !== false)
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
                (player) => `

              <article class="player-card">

                <div class="jersey">
                  #${escapeHtml(player.jersey_number)}
                </div>

                <div>

                  <div class="player-name">
                    ${escapeHtml(player.name)}
                  </div>

                  <div class="player-meta">
                    ${escapeHtml(player.position)}
                    •
                    ${escapeHtml(player.grade)}
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


/* =========================================================
   RECORD
   ========================================================= */

function seasonRecord(games) {
  let wins = 0;
  let losses = 0;
  let ties = 0;

  games.forEach((game) => {
    const result = getResult(game);

    if (result === "win") {
      wins++;
    } else if (result === "loss") {
      losses++;
    } else if (result === "tie") {
      ties++;
    }
  });

  return ties
    ? `${wins}-${losses}-${ties}`
    : `${wins}-${losses}`;
}


/* =========================================================
   HISTORY
   ========================================================= */

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
      .map((year) => {
        const games = state.games
          .filter(
            (game) =>
              Number(game.season) === year
          )
          .sort((a, b) =>
            a.game_date.localeCompare(
              b.game_date
            )
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


/* =========================================================
   NAVIGATION
   ========================================================= */

function switchPage(page) {
  state.page = page;

  document
    .querySelectorAll(".view")
    .forEach((view) => {
      view.classList.remove("active");
    });

  const target = document.querySelector(
    `#${page}-page`
  );

  if (target) {
    target.classList.add("active");
  }

  document
    .querySelectorAll(".nav-item")
    .forEach((button) => {
      button.classList.toggle(
        "active",
        button.dataset.page === page
      );
    });

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });
}


/* =========================================================
   LOAD DATA
   ========================================================= */

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
    (game) => Number(game.season) === 2026
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


/* =========================================================
   COUNTDOWN
   ========================================================= */

function startGameCountdown(game) {
  const countdown =
    document.getElementById(
      "game-countdown"
    );

  const live =
    document.getElementById(
      "game-live"
    );

  if (!countdown || !live || !game) {
    return;
  }

  /*
    Clear the previous timer.

    This prevents multiple countdowns from running
    if the Home page is rendered again.
  */
  if (state.countdownTimer) {
    clearInterval(
      state.countdownTimer
    );

    state.countdownTimer = null;
  }

  const gameDate =
    getGameDateTime(game);

  if (!gameDate) {
    return;
  }

  function updateCountdown() {
    /*
      The elements may have been replaced by a
      new renderHome() call.
    */
    if (
      !document.body.contains(countdown) ||
      !document.body.contains(live)
    ) {
      clearInterval(
        state.countdownTimer
      );

      state.countdownTimer = null;

      return;
    }

    const now = new Date();

    const difference =
      gameDate.getTime() -
      now.getTime();

    if (difference <= 0) {
      countdown.style.display =
        "none";

      live.style.display =
        "inline";

      return;
    }

    const totalSeconds =
      Math.floor(
        difference / 1000
      );

    const days =
      Math.floor(
        totalSeconds / 86400
      );

    const hours =
      Math.floor(
        (totalSeconds % 86400) /
          3600
      );

    const minutes =
      Math.floor(
        (totalSeconds % 3600) /
          60
      );

    const seconds =
      totalSeconds % 60;

    let text = "";

    if (days > 0) {
      text =
        `Starts in ${days}d ${hours}h ${minutes}m`;
    } else {
      text =
        `Starts in ${String(hours).padStart(
          2,
          "0"
        )}:${String(minutes).padStart(
          2,
          "0"
        )}:${String(seconds).padStart(
          2,
          "0"
        )}`;
    }

    countdown.textContent = text;

    countdown.style.display =
      "inline";

    live.style.display =
      "none";
  }

  updateCountdown();

  state.countdownTimer =
    setInterval(
      updateCountdown,
      1000
    );
}


/* =========================================================
   NAV BUTTON EVENTS
   ========================================================= */

document
  .querySelectorAll(".nav-item")
  .forEach((button) => {

    button.addEventListener(
      "click",
      () =>
        switchPage(
          button.dataset.page
        )
    );

  });


/* =========================================================
   WINDOW RESIZE
   ========================================================= */

window.addEventListener(
  "resize",
  () => {
    fitOpponentName();
  }
);


/* =========================================================
   START APP
   ========================================================= */

loadData().catch((error) => {

  console.error(error);

  const homePage =
    $("home-page");

  if (!homePage) {
    return;
  }

  homePage.innerHTML = `

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
