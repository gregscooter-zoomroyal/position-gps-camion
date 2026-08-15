const toggle = document.getElementById("nav-toggle");
const links = document.getElementById("links");
toggle.addEventListener("click", () => links.classList.toggle("open"));
links.querySelectorAll("a").forEach(a => a.addEventListener("click", () => links.classList.remove("open")));

document.getElementById("form").addEventListener("submit", (e) => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(e.target).entries());
  const body = encodeURIComponent(
    `Nom: ${data.name}\nTél: ${data.phone}\nVille: ${data.city}\nTravaux: ${data.job}\n\n${data.msg}`
  );
  window.location.href = `mailto:?subject=${encodeURIComponent("Estimation Pavage G.O.")}&body=${body}`;
  document.getElementById("ok").classList.add("on");
  e.target.reset();
});
