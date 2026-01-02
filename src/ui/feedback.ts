import { Result } from "../core";

export type MessageKind = "info" | "error" | "success";

const messageEl = (root: HTMLElement): HTMLElement => {
    const el = root.querySelector<HTMLElement>("#ui-message");
    if (!el) throw new Error("Brak #ui-message (UI message area).");
    return el;
};


let clearTimer: number | null = null;

const cancelAutoClear = (): void => {
    if (clearTimer !== null) {
        window.clearTimeout(clearTimer);
        clearTimer = null;
    }
};

/**
 * @param root Korzeń aplikacji.
 * @remarks Efekt DOM; czyści komunikat UI i resetuje stan widoczności.
 */
export const clearMessage = (root: HTMLElement): void => {
    cancelAutoClear();
    const el = messageEl(root);
    el.textContent = "";
    el.setAttribute("data-kind", "");
    el.classList.add("hidden");
};

/**
 * @param root Korzeń aplikacji.
 * @param kind Typ komunikatu (info/success/error).
 * @param text Treść komunikatu.
 * @param opts Opcje zachowania (np. auto-clear).
 * @remarks Efekt DOM; centralny kanał komunikatów; brak logiki domenowej.
 */
export const setMessage = (
    root: HTMLElement,
    kind: MessageKind,
    text: string,
    opts?: { autoClearMs?: number }
): void => {
    cancelAutoClear();

    const el = messageEl(root);
    el.textContent = text;
    el.setAttribute("data-kind", kind);
    el.classList.remove("hidden");


    const defaultMs = kind === "error" ? 0 : 2500;
    const ms = opts?.autoClearMs ?? defaultMs;

    if (ms > 0) {
        clearTimer = window.setTimeout(() => {
            if (messageEl(root).textContent === text) {
                clearMessage(root);
            }
        }, ms);
    }
};

/**
 * @param root Korzeń aplikacji.
 * @param result Result do obsłużenia.
 * @param opts Opcje komunikatów sukcesu/błędu.
 * @returns Wartość z Ok lub null przy Err.
 * @remarks Efekt DOM; centralny handler Result; minimalizuje rozproszenie obsługi błędów w UI.
 */
export const notifyResult = <T>(
    root: HTMLElement,
    result: Result<T>,
    opts?: {
        successMessage?: string;
        clearOnSuccess?: boolean;
        successAutoClearMs?: number;
        errorAutoClearMs?: number;
    }
): T | null => {
    if (result.ok) {
        if (opts?.successMessage) {
            setMessage(root, "success", opts.successMessage, {
                autoClearMs: opts.successAutoClearMs ?? 2500,
            });
        } else if (opts?.clearOnSuccess) {
            clearMessage(root);
        }
        return result.value;
    }

    setMessage(root, "error", result.error, {
        autoClearMs: opts?.errorAutoClearMs ?? 0,
    });
    return null;
};
