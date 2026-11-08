import './overlays.css';
import { h, icon } from './dom';

export function openYouTubeModal(id: string): () => void {
  const frame = h('iframe', {
    src: `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?autoplay=1&rel=0&modestbranding=1&playsinline=1`,
    allow: 'autoplay; encrypted-media; fullscreen', allowfullscreen: true, title: 'Trailer', referrerpolicy: 'strict-origin-when-cross-origin',
  });
  const closeBtn = h('button', { class: 'tide-ib tide-trailer-close', type: 'button', 'aria-label': 'Close trailer' }, icon('close'));
  const el = h('div', { class: 'tide-trailer', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Trailer' }, h('div', { class: 'tide-trailer-box' }, frame), closeBtn);
  const close = () => {
    el.remove();
    document.body.classList.remove('tide-modal-open');
    document.removeEventListener('keydown', onKey, true);
  };
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); close(); } };
  closeBtn.addEventListener('click', close);
  el.addEventListener('click', (e) => { if (e.target === el) close(); });
  document.addEventListener('keydown', onKey, true);
  document.body.classList.add('tide-modal-open');
  document.body.append(el);
  closeBtn.focus();
  return close;
}
