'use strict';
const html = document.documentElement;
const themeToggle = document.getElementById('themeToggle');
const systemTheme = window.matchMedia('(prefers-color-scheme: dark)');
let manualTheme;
try { manualTheme = localStorage.getItem('theme'); } catch {}
if (!['light', 'dark'].includes(manualTheme)) manualTheme = null;
function setTheme(theme) {
  html.dataset.theme = theme;
  const next = theme === 'dark' ? 'Light' : 'Dark';
  document.getElementById('themeIcon').textContent = next;
  themeToggle.setAttribute('aria-label', `Switch to ${next.toLowerCase()} mode`);
  const photo = document.getElementById('profileImgTop');
  const name = theme === 'dark' ? 'night' : 'daytime';
  photo.closest('picture').querySelector('source').srcset = `images/${name}.webp`;
  photo.src = `images/${name}.jpg`;
}
setTheme(manualTheme || (systemTheme.matches ? 'dark' : 'light'));
themeToggle.addEventListener('click', () => {
  manualTheme = html.dataset.theme === 'dark' ? 'light' : 'dark';
  setTheme(manualTheme);
  try { localStorage.setItem('theme', manualTheme); } catch {}
});
systemTheme.addEventListener('change', event => {
  if (!manualTheme) setTheme(event.matches ? 'dark' : 'light');
});
const filters = [...document.querySelectorAll('.filter-btn')];
const cards = [...document.querySelectorAll('.card[data-tags]')];
const matches = (card, filter) => filter === 'all' || card.dataset.tags.split(',').includes(filter);
function filterPublications(filter) {
  let count = 0;
  cards.forEach(card => {
    card.hidden = !matches(card, filter);
    if (!card.hidden) count++;
  });
  filters.forEach(button => {
    const active = button.dataset.filter === filter;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  document.getElementById('noResults').hidden = count !== 0;
  document.getElementById('filterStatus').textContent = `${count} publication${count === 1 ? '' : 's'}`;
}
filters.forEach(button => {
  button.querySelector('.count').textContent = cards.filter(card => matches(card, button.dataset.filter)).length;
  button.addEventListener('click', () => filterPublications(button.dataset.filter));
});
filterPublications('all');
const backToTop = document.getElementById('backToTop');
function updateBackToTop() { backToTop.classList.toggle('visible', window.scrollY > 600); }
window.addEventListener('scroll', updateBackToTop, { passive: true });
updateBackToTop();
backToTop.addEventListener('click', () => {
  document.querySelector('.navbar-brand').focus({ preventScroll: true });
  window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
});
document.getElementById('copyrightYear').textContent = new Date().getFullYear();
