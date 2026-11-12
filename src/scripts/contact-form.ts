/**
 * Contact form behaviour (progressive enhancement of src/components/ContactForm.astro).
 *
 * - Loads Turnstile when the form comes near (loadTurnstileNear) and renders the widget into div.cf-turnstile (explicit render, appearance
 *   "interaction-only", so it takes no space unless the visitor has to interact). Test sitekey and
 *   API: https://developers.cloudflare.com/turnstile/troubleshooting/testing/ and
 *   https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/
 * - On submit: one JSON POST to /api/contact per submission ({name,email,service,message,turnstileToken}).
 *   While it is pending the button is disabled and aria-busy, shows Framer's Loading variant and runs
 *   the "button.submit.spinner" loop from content/motion.json (not under reduced motion).
 * - Result: Framer's Success / Error button variant, and the same content text in the
 *   [data-form-status] live region. Success resets the fields; any failure keeps them.
 *   A 400 marks the field the Worker named as invalid and moves focus to it.
 *
 * Every visible string comes from the page (rendered from content/home.json), none from here.
 */
import type { Effect } from "../content/schema";
import { loop, type LoopControls } from "../motion/loop";

interface Turnstile {
  render(container: HTMLElement, options: Record<string, unknown>): string | null | undefined;
  getResponse(widgetId?: string): string | undefined;
  reset(widgetId?: string): void;
}

declare global {
  interface Window {
    turnstile?: Turnstile;
  }
}

type State = "idle" | "loading" | "success" | "error";
type Outcome = { state: "success" } | { state: "error"; field?: string; resetTurnstile: boolean };

const SPINNER_EFFECT = "button.submit.spinner";
const FIELDS = ["name", "email", "service", "message"] as const;

/**
 * The Worker's 400 messages (worker/validate.ts) start with the field they are about. Content has no
 * per-field error copy, so every 400 shows the generic error text; the field is marked and focused.
 */
const FIELD_OF_ERROR: [RegExp, (typeof FIELDS)[number]][] = [
  [/^Name\b/, "name"],
  [/^Email\b/, "email"],
  [/^Choose a service\b/, "service"],
  [/^Message\b/, "message"],
];

function spinnerEffect(): Extract<Effect, { kind: "loop" }> | undefined {
  const config = document.getElementById("motion-config")?.textContent;
  if (!config) return undefined;
  const effect = (JSON.parse(config) as Record<string, Effect>)[SPINNER_EFFECT];
  return effect?.kind === "loop" ? effect : undefined;
}

const TURNSTILE_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
/** The script starts loading once the form is within one viewport height of the screen. */
const LOAD_AHEAD = "100% 0px";

/**
 * Turnstile's script (and its iframe) loads only when the visitor nears the form or focuses one of
 * its fields, not with the page: at the top of the page it competed with the hero for the first
 * paint (Lighthouse LCP on slow CI runners). `onReady` runs once the API is available.
 */
function loadTurnstileNear(form: HTMLFormElement, onReady: () => void): void {
  if (window.turnstile) return onReady();
  let started = false;
  const start = (): void => {
    if (started) return;
    started = true;
    observer.disconnect();
    form.removeEventListener("focusin", start);
    const script = document.createElement("script");
    script.src = TURNSTILE_SRC;
    script.async = true;
    script.addEventListener("load", onReady);
    document.head.appendChild(script);
  };
  const observer = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && start(), { rootMargin: LOAD_AHEAD });
  observer.observe(form);
  form.addEventListener("focusin", start);
}

function enhance(form: HTMLFormElement): void {
  const button = form.querySelector<HTMLButtonElement>('button[type="submit"]');
  const status = form.querySelector<HTMLElement>("[data-form-status]");
  if (!button || !status) return;
  const spinner = button.querySelector<HTMLElement>("[data-form-spinner]");
  const container = form.querySelector<HTMLElement>(".cf-turnstile");
  const copy = (label: "success" | "error"): string =>
    button.querySelector(`[data-label="${label}"]`)?.textContent?.trim() ?? "";
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const spinEffect = spinnerEffect();

  let widgetId: string | undefined;
  let pending = false;
  let spinning: LoopControls[] = [];

  // ------------------------------------------------------------- Turnstile
  const renderWidget = (): void => {
    if (widgetId !== undefined || !container || !window.turnstile) return;
    widgetId =
      window.turnstile.render(container, {
        sitekey: container.dataset["sitekey"],
        appearance: "interaction-only",
        action: "contact",
        // The widget only takes space while it asks the visitor to interact (see ContactForm.astro CSS).
        "before-interactive-callback": () => container.toggleAttribute("data-interactive", true),
        "after-interactive-callback": () => container.toggleAttribute("data-interactive", false),
      }) ?? undefined;
  };
  loadTurnstileNear(form, renderWidget);

  const token = (): string =>
    window.turnstile?.getResponse(widgetId) ||
    (form.querySelector<HTMLInputElement>('input[name="cf-turnstile-response"]')?.value ?? "");
  const resetWidget = (): void => {
    if (widgetId !== undefined) window.turnstile?.reset(widgetId);
  };

  // ------------------------------------------------------------- button state
  const setState = (state: State): void => {
    if (state === "idle") button.removeAttribute("data-state");
    else button.dataset["state"] = state;
    button.disabled = state === "loading";
    if (state === "loading") button.setAttribute("aria-busy", "true");
    else button.removeAttribute("aria-busy");
    if (state === "loading" && spinner && spinEffect && !reducedMotion.matches) {
      spinning = loop(spinEffect, [spinner]);
    } else if (spinning.length > 0) {
      for (const animation of spinning) animation.stop();
      spinning = [];
      spinner?.style.removeProperty("transform");
      spinner?.style.removeProperty("rotate");
    }
  };

  const announce = (text: string): void => {
    // Cleared first so the same message is announced again on a second attempt.
    status.textContent = "";
    requestAnimationFrame(() => {
      status.textContent = text;
    });
  };

  const fieldElement = (name: string): HTMLElement | null =>
    form.querySelector<HTMLElement>(`[name="${CSS.escape(name)}"]`);
  const clearInvalid = (): void => {
    for (const name of FIELDS) fieldElement(name)?.removeAttribute("aria-invalid");
  };

  // ------------------------------------------------------------- submit
  const send = async (): Promise<Outcome> => {
    const data = new FormData(form);
    const value = (name: string): string => {
      const v = data.get(name);
      return typeof v === "string" ? v : "";
    };
    const body = {
      name: value("name"),
      email: value("email"),
      service: value("service"),
      message: value("message"),
      turnstileToken: token(),
    };
    try {
      const res = await fetch(form.action, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) return { state: "success" };
      if (res.status === 400) {
        // Invalid input: the Turnstile token was not used, so the widget is left as it is.
        const reply = (await res.json().catch(() => null)) as { error?: unknown } | null;
        const error = typeof reply?.error === "string" ? reply.error : "";
        const field = FIELD_OF_ERROR.find(([pattern]) => pattern.test(error))?.[1];
        return field ? { state: "error", field, resetTurnstile: false } : { state: "error", resetTurnstile: false };
      }
      return { state: "error", resetTurnstile: true };
    } catch {
      // Offline, aborted or blocked: the token may have been spent, so get a fresh one.
      return { state: "error", resetTurnstile: true };
    }
  };

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (pending) return;
    pending = true;
    clearInvalid();
    setState("loading");

    void send().then((outcome) => {
      pending = false;
      const hadFocus = document.activeElement === button || document.activeElement === document.body;
      if (outcome.state === "success") {
        form.reset();
        resetWidget();
        setState("success");
        announce(copy("success"));
        if (hadFocus) button.focus();
        return;
      }
      if (outcome.resetTurnstile) resetWidget();
      setState("error");
      announce(copy("error"));
      const field = outcome.field ? fieldElement(outcome.field) : null;
      if (field) {
        field.setAttribute("aria-invalid", "true");
        field.focus();
      } else if (hadFocus) {
        button.focus();
      }
    });
  });

  // Editing again after a result brings the button back to its resting variant.
  const toIdle = (event: Event): void => {
    if (pending) return;
    if (event.target instanceof HTMLElement) event.target.removeAttribute("aria-invalid");
    if (button.dataset["state"]) setState("idle");
  };
  form.addEventListener("input", toIdle);
  form.addEventListener("change", toIdle);
}

const form = document.querySelector<HTMLFormElement>("#contact-form");
if (form) enhance(form);
