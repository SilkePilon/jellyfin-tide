import { SELECTORS } from '../router/selectors';

/**
 * F1 · C3 top bar: library links show their icon only (the current one is a white pill with its name). Their label is
 * a bare text node inside the MUI button: copy it to `data-tide-label` (CSS tooltip) and `aria-label`.
 */
export function labelNavLinks(root: ParentNode = document): void {
  root.querySelectorAll<HTMLAnchorElement>(`${SELECTORS.appBar} > .MuiToolbar-root:first-child > .MuiStack-root > a.MuiButton-root:not([href="#/"])`).forEach((a) => {
    const label = [...a.childNodes].filter((n) => n.nodeType === Node.TEXT_NODE).map((n) => n.textContent ?? '').join('').trim();
    if (!label) return;
    if (a.dataset.tideLabel !== label) a.dataset.tideLabel = label;
    if (a.getAttribute('aria-label') !== label) a.setAttribute('aria-label', label);
  });
}

/**
 * The actions island's fill reaches under the user box (actions + avatar read as one island). That box can hold more
 * than the avatar (other plugins add header buttons there): tell CSS its real width.
 */
export function measureUserBox(root: ParentNode = document): void {
  const tb = root.querySelector<HTMLElement>(`${SELECTORS.appBar} > .MuiToolbar-root:first-child`);
  const box = tb?.querySelector<HTMLElement>(':scope > .MuiBox-root:last-child');
  if (!tb || !box) return;
  const w = `${box.offsetWidth}px`;
  if (tb.style.getPropertyValue('--tide-ub-w') !== w) tb.style.setProperty('--tide-ub-w', w);
}
