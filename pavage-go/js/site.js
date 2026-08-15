const KEY = "pavage-go-preview";
const PASS = "cursor";
const gate = document.getElementById("gate");
const site = document.getElementById("site");

function unlock() {
  sessionStorage.setItem(KEY, "1");
  gate.classList.add("off");
  site.hidden = false;
}

function allowed() {
  const q = new URLSearchParams(location.search);
  return sessionStorage.getItem(KEY) === "1" || (q.get("acces") || "").toLowerCase() === PASS;
}

if (allowed()) unlock();

document.getElementById("gate-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const err = document.getElementById("gate-err");
  if (document.getElementById("gate-pass").value.trim().toLowerCase() === PASS) {
    err.textContent = "";
    unlock();
  } else {
    err.textContent = "Mot de passe incorrect.";
  }
});

const toggle = document.getElementById("nav-toggle");
const links = document.getElementById("links");
toggle.addEventListener("click", () => links.classList.toggle("open"));
links.querySelectorAll("a").forEach(a => a.addEventListener("click", () => links.classList.remove("open")));

document.getElementById("form").addEventListener("submit", (e) => {
  e.preventDefault();
  document.getElementById("ok").classList.add("on");
  e.target.reset();
});
