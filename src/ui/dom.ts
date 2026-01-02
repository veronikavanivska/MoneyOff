import {
    Currency,
    Expense,
    Filters,
    SortBy,
    State,
    isCurrency,
    computeSummary,
} from "../core";
import {
    formatMoney,
    renderAppHtml,
    renderCategoryOptions,
    renderExpenseRows,
    renderFilterCategoryOptions,
    renderCategorySummary,
    renderMonthlySummary,
} from "./renderers";
import { clearMessage, notifyResult, setMessage } from "./feedback";

export type ImportMode = "replace" | "merge";

export type Handlers = {

    onAdd: (form: FormData) => { ok: true; value: void } | { ok: false; error: string };
    onQuickCategory: (name: string) => { ok: true; value: void } | { ok: false; error: string };
    onFilter: (patch: Partial<Filters>) => void;
    onSort: (sort: SortBy) => void;
    onDelete: (id: string) => { ok: true; value: void } | { ok: false; error: string };
    onEdit: (id: string, form: FormData) => { ok: true; value: void } | { ok: false; error: string };
    onExport: () => void;


    onImportParse: (file: File) => Promise<{ ok: true; value: State } | { ok: false; error: string }>;
    onImportApply: (mode: ImportMode, incoming: State) => { ok: true; value: void } | { ok: false; error: string };
    onRefreshFx: () => Promise<{ ok: true; value: void } | { ok: false; error: string }>;

    onBaseCurrency: (currency: Currency) => void;

    getExpense: (id: string) => Expense | null;
};

const q = <T extends Element>(root: HTMLElement, sel: string): T => {
    const el = root.querySelector<T>(sel);
    if (!el) throw new Error(`Brak elementu UI: ${sel}`);
    return el;
};

/**
 * @param root Korzeń aplikacji.
 * @param state Aktualny stan.
 * @param visible Widoczne wydatki.
 * @param handlers Callbacki logiki domenowej.
 * @remarks Granica IO; pełny render do DOM + podpięcie zdarzeń; UI jako imperatywna powłoka.
 */
export const mountApp = (
    root: HTMLElement,
    state: State,
    visible: ReadonlyArray<Expense>,
    handlers: Handlers
): void => {
    root.innerHTML = renderAppHtml(state, visible);
    bindEvents(root, state, handlers);

    const filterCat = root.querySelector<HTMLSelectElement>("#filter-cat");
    if (filterCat) filterCat.value = state.filters.category ?? "";

    const sortSelect = root.querySelector<HTMLSelectElement>("#sort-select");
    if (sortSelect) sortSelect.value = state.sort;

    const formCurrency = root.querySelector<HTMLSelectElement>("#form-currency");
    if (formCurrency) formCurrency.value = state.currency;

    const baseCurrency = root.querySelector<HTMLSelectElement>("#base-currency");
    if (baseCurrency) baseCurrency.value = state.currency;
};

/**
 * @param root Korzeń aplikacji.
 * @param state Aktualny stan.
 * @param visible Widoczne wydatki.
 * @remarks Granica IO; częściowa aktualizacja DOM (lista + podsumowania) bez pełnego rerendera.
 */
export const updateList = (root: HTMLElement, state: State, visible: ReadonlyArray<Expense>): void => {
    const summary = computeSummary(visible, state.currency, state.fxPLN);

    const expenseList = root.querySelector<HTMLElement>("#expense-list");
    if (expenseList) expenseList.innerHTML = renderExpenseRows(visible);

    const summaryGrid = root.querySelector<HTMLElement>("#summary-grid");
    if (summaryGrid) {
        summaryGrid.innerHTML = `
      <div class="summary-item">
        <div class="summary-value" id="summary-total">${formatMoney(summary.total, state.currency)}</div>
        <div class="summary-label">Suma całkowita</div>
      </div>
      ${renderCategorySummary(summary, state.currency)}
    `;
    }

    const monthlySection = root.querySelector<HTMLElement>("#monthly-section");
    if (monthlySection) {
        monthlySection.innerHTML =
            summary.monthly.length > 0
                ? `<h2 style="margin-top:var(--gap)">Miesięcznie</h2><div class="summary-grid">${renderMonthlySummary(
                    summary,
                    state.currency
                )}</div>`
                : "";
    }
};

/**
 * @param root Korzeń aplikacji.
 * @param state Aktualny stan.
 * @remarks Granica IO; aktualizacja selectów kategorii w DOM bez dotykania domeny.
 */
export const updateCategories = (root: HTMLElement, state: State): void => {
    const formCategory = root.querySelector<HTMLSelectElement>("#form-category");
    if (formCategory) formCategory.innerHTML = renderCategoryOptions(state);

    const editCategory = root.querySelector<HTMLSelectElement>("#edit-category");
    if (editCategory) editCategory.innerHTML = renderCategoryOptions(state);

    const filterCat = root.querySelector<HTMLSelectElement>("#filter-cat");
    if (filterCat) {
        const currentValue = filterCat.value;
        filterCat.innerHTML = renderFilterCategoryOptions(state);
        filterCat.value = currentValue;
    }
};

/**
 * @param root Korzeń aplikacji.
 * @param state Aktualny stan.
 * @remarks Granica IO; aktualizacja atrybutów min/max i wartości pól dat w filtrach.
 */
export const updateFilterDates = (root: HTMLElement, state: State): void => {
    const filterFrom = root.querySelector<HTMLInputElement>("#filter-from");
    const filterTo = root.querySelector<HTMLInputElement>("#filter-to");

    if (filterFrom) {
        filterFrom.value = state.filters.dateFrom ?? "";
        state.filters.dateTo ? filterFrom.setAttribute("max", state.filters.dateTo) : filterFrom.removeAttribute("max");
    }

    if (filterTo) {
        filterTo.value = state.filters.dateTo ?? "";
        state.filters.dateFrom ? filterTo.setAttribute("min", state.filters.dateFrom) : filterTo.removeAttribute("min");
    }
};


/**
 * @param root Korzeń aplikacji.
 * @param text Treść pytania.
 * @returns Promise<boolean> – decyzja użytkownika.
 * @remarks Efekt DOM; dialog modalny; kontrolowany przepływ UI.
 */
const confirmDialog = async (root: HTMLElement, text: string): Promise<boolean> => {
    const dialog = q<HTMLDialogElement>(root, "#confirm-dialog");
    q<HTMLElement>(root, "#confirm-text").textContent = text;

    dialog.showModal();
    const ok = await new Promise<boolean>((resolve) => {
        const onClose = () => {
            dialog.removeEventListener("close", onClose);
            resolve(dialog.returnValue === "ok");
        };
        dialog.addEventListener("close", onClose);
    });
    return ok;
};

/**
 * @param root Korzeń aplikacji.
 * @returns Promise trybu importu lub null (anulowanie).
 * @remarks Efekt DOM; dialog wyboru; brak logiki domenowej.
 */
const importChoiceDialog = async (root: HTMLElement): Promise<ImportMode | null> => {
    const dialog = q<HTMLDialogElement>(root, "#import-choice-dialog");
    dialog.showModal();

    const choice = await new Promise<ImportMode | null>((resolve) => {
        const onClose = () => {
            dialog.removeEventListener("close", onClose);
            const v = dialog.returnValue;
            resolve(v === "replace" || v === "merge" ? (v as ImportMode) : null);
        };
        dialog.addEventListener("close", onClose);
    });

    return choice;
};

/**
 * @param root Korzeń aplikacji.
 * @param exp Wydatek do edycji.
 * @remarks Efekt DOM; wypełnia formularz edycji i otwiera dialog; brak mutacji domeny.
 */
const openEditDialog = (root: HTMLElement, exp: Expense): void => {
    const dialog = q<HTMLDialogElement>(root, "#edit-dialog");
    const form = q<HTMLFormElement>(root, "#edit-form");

    (form.elements.namedItem("amount") as HTMLInputElement).value = String(exp.amount);
    (form.elements.namedItem("date") as HTMLInputElement).value = exp.dateISO;
    (form.elements.namedItem("note") as HTMLTextAreaElement).value = exp.note;

    const curSel = q<HTMLSelectElement>(root, "#edit-currency");
    curSel.value = exp.currency;

    const catSel = q<HTMLSelectElement>(root, "#edit-category");
    if (![...catSel.options].some((o) => o.value === exp.category)) {
        const opt = document.createElement("option");
        opt.value = exp.category;
        opt.textContent = exp.category;
        catSel.appendChild(opt);
    }
    catSel.value = exp.category;

    dialog.setAttribute("data-edit-id", exp.id);
    dialog.showModal();
};

/**
 * @param root Korzeń aplikacji.
 * @remarks Efekt DOM; zamyka dialog edycji i czyści atrybuty pomocnicze.
 */
const closeEditDialog = (root: HTMLElement): void => {
    const dialog = q<HTMLDialogElement>(root, "#edit-dialog");
    dialog.removeAttribute("data-edit-id");
    dialog.close();
};


/**
 * @param root Korzeń aplikacji.
 * @param state Aktualny stan.
 * @param handlers Callbacki logiki domenowej.
 * @remarks Efekt DOM; podpina event listeners; UI deleguje logikę do callbacków.
 */
const bindEvents = (root: HTMLElement, state: State, handlers: Handlers): void => {

    const addForm = q<HTMLFormElement>(root, "#add-form");
    addForm.addEventListener("submit", (ev) => {
        ev.preventDefault();
        clearMessage(root);

        const r = handlers.onAdd(new FormData(addForm));
        const ok = notifyResult(root, r, { clearOnSuccess: true });
        if (ok !== null) {
            addForm.reset();
            const dateInput = addForm.querySelector<HTMLInputElement>('input[name="date"]');
            if (dateInput) dateInput.value = new Date().toISOString().slice(0, 10);

            const currencySelect = addForm.querySelector<HTMLSelectElement>("#form-currency");
            if (currencySelect) currencySelect.value = state.currency;
        }
    });


    q<HTMLButtonElement>(root, "#add-cat-btn").addEventListener("click", () => {
        clearMessage(root);
        const input = q<HTMLInputElement>(root, "#quick-cat");
        const r = handlers.onQuickCategory(input.value.trim());
        const ok = notifyResult(root, r, { successMessage: "Dodano kategorię.", successAutoClearMs: 2000 });
        if (ok !== null) input.value = "";
    });


    q<HTMLInputElement>(root, "#filter-from").addEventListener("change", (e) => {
        handlers.onFilter({ dateFrom: (e.target as HTMLInputElement).value || null });
    });
    q<HTMLInputElement>(root, "#filter-to").addEventListener("change", (e) => {
        handlers.onFilter({ dateTo: (e.target as HTMLInputElement).value || null });
    });
    q<HTMLSelectElement>(root, "#filter-cat").addEventListener("change", (e) => {
        handlers.onFilter({ category: (e.target as HTMLSelectElement).value || null });
    });

    let searchTimeout: number | undefined;
    q<HTMLInputElement>(root, "#filter-text").addEventListener("input", (e) => {
        window.clearTimeout(searchTimeout);
        const v = (e.target as HTMLInputElement).value;
        searchTimeout = window.setTimeout(() => handlers.onFilter({ text: v }), 300);
    });

    q<HTMLSelectElement>(root, "#sort-select").addEventListener("change", (e) => {
        handlers.onSort((e.target as HTMLSelectElement).value as SortBy);
    });


    q<HTMLSelectElement>(root, "#base-currency").addEventListener("change", (e) => {
        const raw = String((e.target as HTMLSelectElement).value ?? "").toUpperCase();
        if (isCurrency(raw)) handlers.onBaseCurrency(raw as Currency);
    });

    q<HTMLButtonElement>(root, "#refresh-fx-btn").addEventListener("click", () => {
        clearMessage(root);
        void handlers.onRefreshFx().then((r) => {
            notifyResult(root, r, { successMessage: "Odświeżono kursy.", successAutoClearMs: 2000  });
        });
    });

    q<HTMLButtonElement>(root, "#export-btn").addEventListener("click", handlers.onExport);

    q<HTMLInputElement>(root, "#import-input").addEventListener("change", (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        (e.target as HTMLInputElement).value = "";
        if (!file) return;

        clearMessage(root);

        void handlers.onImportParse(file).then(async (parsed) => {
            const incoming = notifyResult(root, parsed);
            if (!incoming) return;

            const choice = await importChoiceDialog(root);
            if (!choice) {
                setMessage(root, "info", "Import anulowany.");
                return;
            }

            const applied = handlers.onImportApply(choice, incoming);
            notifyResult(root, applied, {
                successMessage: choice === "replace" ? "Zastąpiono dane." : "Scalono dane.",
                successAutoClearMs: 2000,
            });
        });
    });

    q<HTMLElement>(root, "#expense-list").addEventListener("click", async (ev) => {
        const btn = (ev.target as HTMLElement).closest<HTMLButtonElement>("button[data-action]");
        if (!btn) return;

        const row = btn.closest<HTMLTableRowElement>("tr");
        const id = row?.dataset?.id;
        if (!id) return;

        const action = btn.dataset.action;
        if (action === "delete") {
            clearMessage(root);
            const exp = handlers.getExpense(id);
            const ok = await confirmDialog(root, `Usunąć wydatek ${exp ? `"${exp.category}" ${exp.amount} ${exp.currency}` : ""}?`);
            if (!ok) return;

            const r = handlers.onDelete(id);
            notifyResult(root, r, { successMessage: "Usunięto wydatek.", successAutoClearMs: 2000 });
        }

        if (action === "edit") {
            clearMessage(root);
            const exp = handlers.getExpense(id);
            if (!exp) {
                setMessage(root, "error", "Nie znaleziono wydatku do edycji.");
                return;
            }
            openEditDialog(root, exp);
        }
    });

    const editDialog = q<HTMLDialogElement>(root, "#edit-dialog");
    const editForm = q<HTMLFormElement>(root, "#edit-form");

    q<HTMLButtonElement>(root, "#edit-cancel").addEventListener("click", () => {
        closeEditDialog(root);
    });

    editForm.addEventListener("submit", (ev) => {
        ev.preventDefault();
        clearMessage(root);

        const id = editDialog.getAttribute("data-edit-id");
        if (!id) {
            setMessage(root, "error", "Brak ID edytowanego wydatku.");
            return;
        }

        const r = handlers.onEdit(id, new FormData(editForm));
        const ok = notifyResult(root, r, { successMessage: "Zapisano zmiany.", successAutoClearMs: 2000 });
        if (ok !== null) closeEditDialog(root);
    });

    editDialog.addEventListener("cancel", (e) => {
        e.preventDefault();
        closeEditDialog(root);
    });
};
