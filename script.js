/* ============================================================
   ONE V ONE — front-end, wired to the real backend API.
   Requires config.js (defines window.OVO_API_BASE) to be loaded
   first on every page.
   ============================================================ */

(function () {
  "use strict";

  var API_BASE = window.OVO_API_BASE || "http://localhost:4000/api";
  var TOKEN_KEY = "ovo_token";
  var USER_KEY = "ovo_user";

  /* ---------------- API helper ---------------- */
  async function api(path, options) {
    options = options || {};
    var headers = Object.assign({ "Content-Type": "application/json" }, options.headers || {});
    var token = getToken();
    if (token) headers.Authorization = "Bearer " + token;

    var res = await fetch(API_BASE + path, {
      method: options.method || "GET",
      headers: headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    var data = null;
    try {
      data = await res.json();
    } catch (e) {
      /* empty body */
    }

    if (!res.ok) {
      var message = (data && data.error) || "Something went wrong (" + res.status + ").";
      throw new Error(message);
    }
    return data;
  }

  /* ---------------- Session ---------------- */
  function getToken() {
    return localStorage.getItem(TOKEN_KEY);
  }
  function getCachedUser() {
    try {
      return JSON.parse(localStorage.getItem(USER_KEY));
    } catch (e) {
      return null;
    }
  }
  function setSession(token, user) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    reflectSessionInChrome();
  }
  function clearSession() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    reflectSessionInChrome();
  }
  function logout() {
    clearSession();
    window.location.href = "index.html";
  }
  window.ovoLogout = logout;

  function reflectSessionInChrome() {
    var user = getCachedUser();
    var hasToken = !!getToken();
    document.body.classList.toggle("is-authed", hasToken && !!user);
    if (user) {
      document.querySelectorAll("[data-user-name]").forEach(function (el) {
        el.textContent = user.username;
      });
      document.querySelectorAll("[data-user-balance]").forEach(function (el) {
        el.textContent = formatCents(user.balanceCents);
      });
    }
  }

  // Revalidate the token against the server and refresh the cached balance.
  // Runs on every page load so the header balance stays accurate and dead
  // tokens get cleared instead of showing stale "signed in" state.
  async function refreshSession() {
    if (!getToken()) return;
    try {
      var data = await api("/auth/me");
      localStorage.setItem(USER_KEY, JSON.stringify(data.user));
      reflectSessionInChrome();
    } catch (err) {
      clearSession();
    }
  }

  /* ---------------- Formatting ---------------- */
  function formatCents(cents) {
    return "$" + (cents / 100).toFixed(2);
  }
  function dollarsToCents(value) {
    return Math.round(parseFloat(value) * 100);
  }

  /* ---------------- Mobile nav ---------------- */
  function initMobileNav() {
    var toggle = document.querySelector(".menu-toggle");
    var nav = document.querySelector("nav.primary");
    if (!toggle || !nav) return;
    toggle.addEventListener("click", function () {
      var isOpen = nav.classList.toggle("open");
      toggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
    });
    nav.querySelectorAll("a").forEach(function (link) {
      link.addEventListener("click", function () {
        nav.classList.remove("open");
        toggle.setAttribute("aria-expanded", "false");
      });
    });
  }

  function highlightActiveNav() {
    var current = location.pathname.split("/").pop() || "index.html";
    document.querySelectorAll("nav.primary a[href]").forEach(function (link) {
      if (link.getAttribute("href") === current) link.classList.add("active");
    });
  }

  /* ---------------- Login / signup forms ---------------- */
  function initAuthForms() {
    var loginForm = document.getElementById("login-form");
    if (loginForm) {
      loginForm.addEventListener("submit", async function (e) {
        e.preventDefault();
        var email = document.getElementById("login-email");
        var password = document.getElementById("login-password");
        var errorBox = document.getElementById("login-error");

        var valid = validateField(email, function (v) { return /\S+@\S+\.\S+/.test(v); }, "Enter a valid email address.");
        valid = validateField(password, function (v) { return v.length >= 6; }, "Password must be at least 6 characters.") && valid;
        if (!valid) return;

        setFormLoading(loginForm, true);
        try {
          var data = await api("/auth/login", {
            method: "POST",
            body: { email: email.value.trim(), password: password.value },
          });
          setSession(data.token, data.user);
          window.location.href = "index.html";
        } catch (err) {
          if (errorBox) { errorBox.textContent = err.message; errorBox.classList.add("show"); }
        } finally {
          setFormLoading(loginForm, false);
        }
      });
    }

    var signupForm = document.getElementById("signup-form");
    if (signupForm) {
      signupForm.addEventListener("submit", async function (e) {
        e.preventDefault();
        var username = document.getElementById("signup-username");
        var email = document.getElementById("signup-email");
        var password = document.getElementById("signup-password");
        var age = document.getElementById("signup-age");
        var terms = document.getElementById("signup-terms");
        var msg = document.getElementById("signup-msg");

        var valid = validateField(username, function (v) { return v.trim().length >= 3; }, "Username must be at least 3 characters.");
        valid = validateField(email, function (v) { return /\S+@\S+\.\S+/.test(v); }, "Enter a valid email address.") && valid;
        valid = validateField(password, function (v) { return v.length >= 6; }, "Password must be at least 6 characters.") && valid;

        if (age && !age.checked) {
          msg.textContent = "You must confirm you meet the age requirement.";
          msg.classList.add("show");
          valid = false;
        }
        if (terms && !terms.checked) {
          msg.textContent = "You must agree to the Terms and Privacy Policy.";
          msg.classList.add("show");
          valid = false;
        }
        if (!valid) return;

        setFormLoading(signupForm, true);
        try {
          var data = await api("/auth/register", {
            method: "POST",
            body: {
              username: username.value.trim(),
              email: email.value.trim(),
              password: password.value,
              ageConfirmed: age ? age.checked : true,
              termsAccepted: terms ? terms.checked : true,
            },
          });
          setSession(data.token, data.user);
          if (msg) {
            msg.textContent = "Account created. Redirecting…";
            msg.classList.remove("show");
            msg.style.color = "var(--green)";
            msg.classList.add("show");
          }
          setTimeout(function () { window.location.href = "index.html"; }, 500);
        } catch (err) {
          if (msg) { msg.textContent = err.message; msg.classList.add("show"); }
        } finally {
          setFormLoading(signupForm, false);
        }
      });
    }
  }

  function setFormLoading(form, isLoading) {
    var btn = form.querySelector("button[type=submit]");
    if (!btn) return;
    btn.disabled = isLoading;
    if (isLoading) {
      btn.setAttribute("data-label", btn.textContent);
      btn.textContent = "Please wait…";
    } else if (btn.getAttribute("data-label")) {
      btn.textContent = btn.getAttribute("data-label");
    }
  }

  function validateField(el, testFn, message) {
    if (!el) return true;
    var field = el.closest(".field");
    var ok = testFn(el.value || "");
    if (field) {
      field.classList.toggle("invalid", !ok);
      var err = field.querySelector(".field-error");
      if (err) err.textContent = message;
    }
    return ok;
  }

  /* ---------------- FAQ accordion ---------------- */
  function initFaq() {
    document.querySelectorAll(".faq-item").forEach(function (item) {
      var q = item.querySelector(".faq-q");
      var a = item.querySelector(".faq-a");
      if (!q || !a) return;
      q.addEventListener("click", function () {
        var isOpen = item.classList.contains("open");
        document.querySelectorAll(".faq-item.open").forEach(function (openItem) {
          if (openItem !== item) {
            openItem.classList.remove("open");
            openItem.querySelector(".faq-a").style.maxHeight = null;
          }
        });
        item.classList.toggle("open", !isOpen);
        a.style.maxHeight = !isOpen ? a.scrollHeight + "px" : null;
      });
    });
  }

  /* ---------------- Modal helpers ---------------- */
  function openModal(id) {
    var modal = document.getElementById(id);
    if (modal) modal.classList.add("open");
  }
  function closeModal(el) {
    var backdrop = el.closest(".modal-backdrop");
    if (backdrop) backdrop.classList.remove("open");
  }
  function initModals() {
    document.querySelectorAll("[data-modal-close]").forEach(function (btn) {
      btn.addEventListener("click", function () { closeModal(btn); });
    });
  }

  /* ---------------- Matchup card rendering ---------------- */
  function matchupCardHtml(m) {
    var slug = m.game.slug;
    return (
      '<div class="m-card matchup-item" data-tags="' + slug + '" data-matchup-id="' + m.id + '">' +
        '<div class="row1"><span class="game-tag">' + escapeHtml(m.game.name.toUpperCase()) + '</span><span class="fmt">' + escapeHtml(m.format) + '</span></div>' +
        '<div class="title">' + escapeHtml(m.title) + '</div>' +
        '<div class="row2"><div class="prize">' + formatCents(m.prizeCents) + '<small>PRIZE</small></div>' +
          '<div class="entry">' + (m.entryCents > 0 ? "Entry: " + formatCents(m.entryCents) : "Free entry") + '</div></div>' +
        '<div class="cta-row"><button class="btn btn-outline-gold btn-sm btn-block" data-challenge-btn data-id="' + m.id + '">Challenge</button></div>' +
      '</div>'
    );
  }

  function tournamentCardHtml(t) {
    var slug = t.game.slug;
    var tags = [slug, t.tier];
    if (t.isFree) tags.push("free");
    return (
      '<div class="m-card tourney-item" data-tags="' + tags.join(",") + '" data-tournament-id="' + t.id + '">' +
        '<div class="row1"><span class="game-tag">' + escapeHtml(t.game.name.toUpperCase()) + '</span><span class="fmt">' + escapeHtml(t.format) + '</span></div>' +
        '<div class="title">' + escapeHtml(t.title) + '</div>' +
        '<div class="row2"><div class="prize">' + formatCents(t.prizeCents) + '<small>GUARANTEED</small></div>' +
          '<div class="entry">' + (t.entryCents > 0 ? "Entry: " + formatCents(t.entryCents) : "Free entry") + '<br>' + t.entryCount + ' entered</div></div>' +
        '<div class="cta-row"><button class="btn btn-outline-gold btn-sm btn-block" data-enter-btn data-id="' + t.id + '">Enter Bracket</button></div>' +
      '</div>'
    );
  }

  function escapeHtml(str) {
    var div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  async function loadMatchups(containerSelector, opts) {
    var container = document.querySelector(containerSelector);
    if (!container) return;
    opts = opts || {};
    try {
      var data = await api("/matchups");
      var matchups = opts.limit ? data.matchups.slice(0, opts.limit) : data.matchups;
      if (!matchups.length) {
        container.innerHTML = '<div class="empty-state"><p>No open matchups right now — check back soon.</p></div>';
        return;
      }
      container.innerHTML = matchups.map(matchupCardHtml).join("");
      wireMatchupActions(container);
      applyStoredFilter(".matchup-item");
    } catch (err) {
      container.innerHTML = '<div class="empty-state"><p>Couldn\'t load matchups: ' + escapeHtml(err.message) + '</p></div>';
    }
  }

  async function loadTournaments(containerSelector) {
    var container = document.querySelector(containerSelector);
    if (!container) return;
    try {
      var data = await api("/tournaments");
      if (!data.tournaments.length) {
        container.innerHTML = '<div class="empty-state"><p>No open tournaments right now — check back soon.</p></div>';
        return;
      }
      container.innerHTML = data.tournaments.map(tournamentCardHtml).join("");
      wireTournamentActions(container);
      applyStoredFilter(".tourney-item");
    } catch (err) {
      container.innerHTML = '<div class="empty-state"><p>Couldn\'t load tournaments: ' + escapeHtml(err.message) + '</p></div>';
    }
  }

  async function loadLeaderboard(containerSelector, opts) {
    var container = document.querySelector(containerSelector);
    if (!container) return;
    opts = opts || {};
    try {
      var data = await api("/leaderboard");
      var rows = opts.limit ? data.leaderboard.slice(0, opts.limit) : data.leaderboard;
      var head = '<div class="lb-row head"><div>RANK</div><div>PLAYER</div><div>XP EARNED</div><div style="text-align:right;">REWARD</div></div>';
      if (!rows.length) {
        container.innerHTML = head + '<div class="empty-state"><p>No ranked players yet — be the first on the board.</p></div>';
        return;
      }
      container.innerHTML = head + rows.map(function (r) {
        var rankClass = r.rank === 1 ? "r1" : r.rank === 2 ? "r2" : r.rank === 3 ? "r3" : "";
        return (
          '<div class="lb-row">' +
            '<div class="lb-rank ' + rankClass + '">' + r.rank + '</div>' +
            '<div class="lb-player"><div class="av"></div><div><div class="name">' + escapeHtml(r.username) + '</div></div></div>' +
            '<div class="lb-xp">' + r.xp + ' XP</div>' +
            '<div class="lb-reward">—</div>' +
          '</div>'
        );
      }).join("");
    } catch (err) {
      container.innerHTML = '<div class="empty-state"><p>Couldn\'t load the leaderboard: ' + escapeHtml(err.message) + '</p></div>';
    }
  }

  function wireMatchupActions(container) {
    container.querySelectorAll("[data-challenge-btn]").forEach(function (btn) {
      btn.addEventListener("click", async function () {
        if (!getToken()) return openModal("auth-modal");
        var id = btn.getAttribute("data-id");
        btn.disabled = true;
        btn.textContent = "Challenging…";
        try {
          await api("/matchups/" + id + "/challenge", { method: "POST" });
          btn.textContent = "Challenge sent!";
          await refreshSession();
        } catch (err) {
          alert(err.message);
          btn.disabled = false;
          btn.textContent = "Challenge";
        }
      });
    });
  }

  function wireTournamentActions(container) {
    container.querySelectorAll("[data-enter-btn]").forEach(function (btn) {
      btn.addEventListener("click", async function () {
        if (!getToken()) return openModal("auth-modal");
        var id = btn.getAttribute("data-id");
        btn.disabled = true;
        btn.textContent = "Entering…";
        try {
          await api("/tournaments/" + id + "/enter", { method: "POST" });
          btn.textContent = "Entered!";
          await refreshSession();
        } catch (err) {
          alert(err.message);
          btn.disabled = false;
          btn.textContent = "Enter Bracket";
        }
      });
    });
  }

  /* ---------------- Chip filters (client-side, over already-rendered items) --- */
  function initChipFilters() {
    document.querySelectorAll("[data-filter-group]").forEach(function (group) {
      var chips = group.querySelectorAll(".chip");
      var targetSelector = group.getAttribute("data-filter-target");

      chips.forEach(function (chip) {
        chip.addEventListener("click", function () {
          chips.forEach(function (c) { c.classList.remove("active"); });
          chip.classList.add("active");
          group.setAttribute("data-active-filter", chip.getAttribute("data-filter"));
          applyFilterNow(targetSelector, chip.getAttribute("data-filter"));
        });
      });
    });
  }

  function applyFilterNow(targetSelector, filter) {
    var items = document.querySelectorAll(targetSelector);
    var anyVisible = false;
    items.forEach(function (item) {
      var tags = (item.getAttribute("data-tags") || "").split(",");
      var show = filter === "all" || tags.indexOf(filter) !== -1;
      item.style.display = show ? "" : "none";
      if (show) anyVisible = true;
    });
    var emptyState = document.querySelector("[data-empty-state='" + targetSelector + "']");
    if (emptyState) emptyState.style.display = items.length && anyVisible ? "none" : items.length ? "block" : "none";
  }

  // Re-apply whatever filter chip is currently active after async content loads.
  function applyStoredFilter(itemSelector) {
    var group = document.querySelector("[data-filter-target='" + itemSelector + "']");
    if (!group) return;
    var active = group.getAttribute("data-active-filter") || "all";
    applyFilterNow(itemSelector, active);
  }

  /* ---------------- Post-a-matchup form (matchups.html) ---------------- */
  function initCreateMatchupForm() {
    var form = document.getElementById("create-matchup-form");
    if (!form) return;

    populateGameSelect(document.getElementById("create-matchup-game"));

    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      var gameSlug = document.getElementById("create-matchup-game").value;
      var format = document.getElementById("create-matchup-format").value.trim();
      var title = document.getElementById("create-matchup-title").value.trim();
      var prize = document.getElementById("create-matchup-prize").value;
      var entry = document.getElementById("create-matchup-entry").value || "0";
      var msg = document.getElementById("create-matchup-msg");

      if (!gameSlug || !format || !title || !prize) {
        msg.textContent = "Fill in every field before posting.";
        msg.classList.add("show");
        return;
      }

      try {
        await api("/matchups", {
          method: "POST",
          body: {
            gameSlug: gameSlug,
            format: format,
            title: title,
            prizeCents: dollarsToCents(prize),
            entryCents: dollarsToCents(entry),
          },
        });
        document.getElementById("create-matchup-modal").classList.remove("open");
        await loadMatchups("#matchup-list");
        await refreshSession();
        form.reset();
        msg.classList.remove("show");
      } catch (err) {
        msg.textContent = err.message;
        msg.classList.add("show");
      }
    });
  }

  async function populateGameSelect(selectEl) {
    if (!selectEl) return;
    try {
      var data = await api("/games");
      selectEl.innerHTML = '<option value="">Select a game</option>' +
        data.games.map(function (g) { return '<option value="' + g.slug + '">' + escapeHtml(g.name) + '</option>'; }).join("");
    } catch (err) {
      selectEl.innerHTML = '<option value="">Couldn\'t load games</option>';
    }
  }

  function initPostChallengeTriggers() {
    document.querySelectorAll("[data-open-post-challenge]").forEach(function (btn) {
      btn.addEventListener("click", function (e) {
        e.preventDefault();
        if (!getToken()) return openModal("auth-modal");
        openModal("create-matchup-modal");
      });
    });
  }

  /* ---------------- Init ---------------- */
  document.addEventListener("DOMContentLoaded", function () {
    initMobileNav();
    highlightActiveNav();
    reflectSessionInChrome();
    refreshSession();
    initAuthForms();
    initFaq();
    initChipFilters();
    initModals();
    initCreateMatchupForm();
    initPostChallengeTriggers();

    loadMatchups("#matchup-list");
    loadMatchups("#home-matchup-scroll", { limit: 5 });
    loadTournaments("#tournament-list");
    loadLeaderboard("#leaderboard-list");
    loadLeaderboard("#home-leaderboard-list", { limit: 3 });
  });
})();
