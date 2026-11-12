/**
 * Click variants: the accordions (services, FAQ). One item open at a time; a click toggles.
 *
 * Markup, per item:
 *   <details data-motion="<effect id>" [open]>            (or any element with data-state="open|closed")
 *     <summary>…</summary>                                (or [data-motion-trigger])
 *     <div data-motion-panel>…</div>
 *   </details>
 * Items are grouped by the closest [data-motion-group], else by their parent element.
 * The runtime keeps data-state="open|closed" on the item and animates the panel's height between
 * the two values of the effect's `height` diff (Framer: "1px" closed, "auto" open). Colours, the
 * chevron rotation and the other diffs are CSS on [data-state].
 */
import { animate } from "motion";
import { toMotionOptions, type EffectOf } from "./transition";

type Variant = EffectOf<"variant">;
type State = "open" | "closed";

/** The [closed, open] heights from the effect's variant diff. */
function heights(effect: Variant): [string, string] | undefined {
  const states = effect.states;
  if (!states) return undefined;
  const diff = "desktop" in states && "tabletPhone" in states ? states["desktop"] : states;
  for (const layer of Object.values(diff ?? {})) {
    const height = (layer as Record<string, [unknown, unknown]>)["height"];
    if (height && typeof height[0] === "string" && typeof height[1] === "string") return [height[0], height[1]];
  }
  return undefined;
}

export function variant(effect: Variant, elements: HTMLElement[]): void {
  if (effect.trigger !== "click") return; // timer variants: timer.ts
  const range = heights(effect);
  if (!range) return;
  const [closedHeight, openHeight] = range;
  const options = toMotionOptions(effect.transition);
  const panelOf = (item: HTMLElement): HTMLElement | null => item.querySelector<HTMLElement>("[data-motion-panel]");
  const stateOf = (item: HTMLElement): State => (item.dataset["state"] === "open" ? "open" : "closed");

  const set = (item: HTMLElement, state: State): void => {
    const panel = panelOf(item);
    if (!panel || stateOf(item) === state) return;
    const from = `${panel.getBoundingClientRect().height}px`;
    item.dataset["state"] = state;
    item.querySelector("summary, [data-motion-trigger]")?.setAttribute("aria-expanded", String(state === "open"));
    if (state === "open") {
      if (item instanceof HTMLDetailsElement) item.open = true;
      void animate(panel, { height: [from, `${panel.scrollHeight}px`] }, options).then(() => {
        if (stateOf(item) === "open") panel.style.height = openHeight;
      });
    } else {
      void animate(panel, { height: [from, closedHeight] }, options).then(() => {
        if (stateOf(item) === "closed" && item instanceof HTMLDetailsElement) item.open = false;
      });
    }
  };

  for (const item of elements) {
    const panel = panelOf(item);
    const trigger = item.querySelector<HTMLElement>("summary, [data-motion-trigger]");
    if (!panel || !trigger) continue;
    const initial: State = item instanceof HTMLDetailsElement ? (item.open ? "open" : "closed") : stateOf(item);
    item.dataset["state"] = initial;
    panel.style.overflow = "hidden";
    panel.style.height = initial === "open" ? openHeight : closedHeight;

    trigger.addEventListener("click", (event) => {
      event.preventDefault();
      const opening = stateOf(item) === "closed";
      if (opening) {
        const group = item.closest("[data-motion-group]") ?? item.parentElement;
        for (const other of elements) if (other !== item && group?.contains(other)) set(other, "closed");
      }
      set(item, opening ? "open" : "closed");
    });
  }
}
