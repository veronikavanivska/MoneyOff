/**
 * @file Helpery renderowania UI.  Głównie czyste generowanie szablonów; podpinanie zdarzeń na brzegach.
 * @remarks Granica IO dla manipulacji DOM jest izolowana tutaj i w main.ts.
 */

import {
    computeSummary,
    Currency,
    CURRENCIES,
    Expense,
    Filters,
    State,
    SortBy
} from "./core";

export type Handlers = {
    onAdd: (form: FormData) => void;
    onQuickCategory: (name: string) => void;
    onFilter: (patch: Partial<Filters>) => void;
    onSort: (sort: SortBy) => void;
    onDelete: (id: string) => void;
    onEdit: (id: string) => void;
    onExport: () => void;
    onImport: (file: File) => void;
};

/**
 * @param n Liczba do sformatowania.
 * @param currency Kod waluty.
 * @returns Sformatowany string.
 * @remarks Czysta funkcja; helper kompozycyjny.
 */
const formatMoney = (n: number, currency: string): string =>
    `${n.toFixed(2)} ${currency}`;

/**
 * @param month Miesiąc w formacie YYYY-MM.
 * @returns Polska nazwa miesiąca z rokiem.
 * @remarks Czysta funkcja; helper kompozycyjny.
 */
const formatMonth = (month: string): string => {
    const [year, m] = month.split("-");
    const months = [
        "Styczeń", "Luty", "Marzec", "Kwiecień", "Maj", "Czerwiec",
        "Lipiec", "Sierpień", "Wrzesień", "Październik", "Listopad", "Grudzień"
    ];
    const idx = parseInt(m, 10) - 1;
    return `${months[idx] ?? m} ${year}`;
};

/**
 * @param selected Wybrana waluta.
 * @returns HTML opcji walut.
 * @remarks Czysta funkcja; generuje markup.
 */
const renderCurrencyOptions = (selected: Currency): string =>
    CURRENCIES.map(
        (c) => `<option value="${c}"${c === selected ? " selected" : ""}>${c}</option>`
    ).join("");

/**
 * @param state Aktualny stan.
 * @returns HTML kategorii jako opcje select.
 * @remarks Czysta funkcja; generuje markup.
 */
const renderCategoryOptions = (state: State): string =>
    state.categories.map((c) => `<option value="${c}">${c}</option>`).join("");

/**
 * @param state Aktualny stan.
 * @returns HTML opcji filtra kategorii.
 * @remarks Czysta funkcja; generuje markup.
 */
const renderFilterCategoryOptions = (state: State): string =>
    `<option value="">Wszystkie kategorie</option>` + renderCategoryOptions(state);

/**
 * @param visible Widoczne wydatki.
 * @returns HTML wierszy tabeli.
 * @remarks Czysta funkcja; generuje markup.
 */
const renderExpenseRows = (visible: ReadonlyArray<Expense>): string =>
    visible.length === 0
        ? `<tr><td colspan="5" class="empty-state">Brak wydatków do wyświetlenia</td></tr>`
        : visible
            .map(
                (e) => `
        <tr data-id="${e.id}">
          <td>${e.dateISO}</td>
          <td>${formatMoney(e.amount, e.currency)}</td>
          <td>${e.category}</td>
          <td>${e.note || "—"}</td>
          <td>
            <div class="action-btns">
              <button class="btn-secondary btn-small" data-action="edit">Edytuj</button>
              <button class="btn-danger btn-small" data-action="delete">Usuń</button>
            </div>
          </td>
        </tr>`
            )
            .join("");

/**
 * @param summary Podsumowanie.
 * @param currency Waluta.
 * @returns HTML podsumowania kategorii.
 * @remarks Czysta funkcja; generuje markup.
 */
const renderCategorySummary = (
    summary: ReturnType<typeof computeSummary>,
    currency: string
): string =>
    summary.byCategory
        .map(
            (c) => `
      <div class="summary-item">
        <div class="summary-value">${formatMoney(c.total, currency)}</div>
        <div class="summary-label">${c.category}</div>
      </div>`
        )
        .join("");

/**
 * @param summary Podsumowanie.
 * @param currency Waluta.
 * @returns HTML podsumowania miesięcznego.
 * @remarks Czysta funkcja; generuje markup.
 */
const renderMonthlySummary = (
    summary: ReturnType<typeof computeSummary>,
    currency: string
): string =>
    summary.monthly
        .map(
            (m) => `
      <div class="summary-item">
        <div class="summary-value">${formatMoney(m.total, currency)}</div>
        <div class="summary-label">${formatMonth(m.month)}</div>
      </div>`
        )
        .join("");

/**
 * @param root Element główny.
 * @param state Aktualny stan.
 * @param visible Widoczne wydatki.
 * @param handlers Handlery zdarzeń.
 * @remarks Granica IO; pełne renderowanie przy pierwszym wywołaniu.
 */
export const renderApp = (
    root: HTMLElement,
    state: State,
    visible: ReadonlyArray<Expense>,
    handlers: Handlers
): void => {
    const summary = computeSummary(visible);

    root.innerHTML = `
  <div class="header-row">
    <div>
      <h1>Tracker Wydatków</h1>
      <p class="subtitle">Offline • Dane w localStorage</p>
    </div>
    <div class="btn-row">
      <button class="btn-primary" id="export-btn">Eksportuj</button>
      <label class="btn-secondary" style="cursor: pointer;display: inline-flex;align-items:center;padding:10px 18px;">
        Importuj
        <input type="file" accept="application/json" id="import-input" class="hidden" />
      </label>
    </div>
  </div>

  <section class="card">
    <h2>Dodaj wydatek</h2>
    <form id="add-form">
      <div class="form-grid">
        <label>
          Kwota
          <input type="number" name="amount" step="0.01" min="0" placeholder="0. 00" required />
        </label>
        <label>
          Waluta
          <select name="currency" id="form-currency">${renderCurrencyOptions(state.currency)}</select>
        </label>
        <label>
          Kategoria
          <select name="category" id="form-category" required>${renderCategoryOptions(state)}</select>
        </label>
        <label>
          Data
          <input type="date" name="date" value="${new Date().toISOString().slice(0, 10)}" required />
        </label>
        <label class="full-width">
          Notatka (opcjonalnie)
          <textarea name="note" placeholder="Na co wydano? "></textarea>
        </label>
      </div>
      <div class="quick-add">
        <input type="text" id="quick-cat" placeholder="Szybkie dodanie kategorii" />
        <button type="button" class="btn-secondary" id="add-cat-btn">Dodaj</button>
      </div>
      <div class="btn-row">
        <button type="submit" class="btn-primary">Zapisz wydatek</button>
      </div>
    </form>
  </section>

  <section class="card">
    <h2>Filtry</h2>
    <div class="filters">
      <label>
        Od
        <input type="date" id="filter-from" value="${state.filters.dateFrom ?? ""}" ${state.filters.dateTo ? `max="${state.filters.dateTo}"` : ""} />
      </label>
      <label>
        Do
        <input type="date" id="filter-to" value="${state.filters.dateTo ?? ""}" ${state.filters.dateFrom ? `min="${state.filters.dateFrom}"` : ""} />
      </label>
      <label>
        Kategoria
        <select id="filter-cat">${renderFilterCategoryOptions(state)}</select>
      </label>
      <label>
        Szukaj
        <input type="text" id="filter-text" placeholder="Szukaj w notatkach" value="${state.filters.text}" />
      </label>
      <label>
        Sortuj
        <select id="sort-select">
          <option value="date" ${state.sort === "date" ? "selected" : ""}>Data (najnowsze)</option>
          <option value="amount" ${state.sort === "amount" ? "selected" : ""}>Kwota (najwyższa)</option>
        </select>
      </label>
    </div>
  </section>

  <section class="card" id="summary-section">
    <h2>Podsumowanie</h2>
    <div class="summary-grid" id="summary-grid">
      <div class="summary-item">
        <div class="summary-value" id="summary-total">${formatMoney(summary.total, state.currency)}</div>
        <div class="summary-label">Suma całkowita</div>
      </div>
      ${renderCategorySummary(summary, state.currency)}
    </div>
    <div id="monthly-section">
      ${
        summary.monthly.length > 0
            ? `<h2 style="margin-top:var(--gap)">Miesięcznie</h2><div class="summary-grid">${renderMonthlySummary(summary, state.currency)}</div>`
            : ""
    }
    </div>
  </section>

  <section class="card">
    <h2>Lista wydatków</h2>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Data</th>
            <th>Kwota</th>
            <th>Kategoria</th>
            <th>Notatka</th>
            <th>Akcje</th>
          </tr>
        </thead>
        <tbody id="expense-list">${renderExpenseRows(visible)}</tbody>
      </table>
    </div>
  </section>
`;


    bindEvents(root, state, handlers);
};

/**
 * @param root Element główny.
 * @param state Aktualny stan.
 * @param handlers Handlery zdarzeń.
 * @remarks Granica IO; podpina wszystkie eventy do DOM.
 */
const bindEvents = (root: HTMLElement, state: State, handlers: Handlers): void => {
    const form = root.querySelector<HTMLFormElement>("#add-form")!;
    form.addEventListener("submit", (ev) => {
        ev.preventDefault();
        handlers.onAdd(new FormData(form));
        form.reset();
        const dateInput = form.querySelector<HTMLInputElement>('input[name="date"]');
        if (dateInput) dateInput.value = new Date().toISOString().slice(0, 10);
        const currencySelect = form.querySelector<HTMLSelectElement>("#form-currency");
        if (currencySelect) currencySelect.value = state.currency;
    });

    root.querySelector<HTMLButtonElement>("#add-cat-btn")!.addEventListener("click", () => {
        const input = root.querySelector<HTMLInputElement>("#quick-cat")!;
        handlers.onQuickCategory(input.value.trim());
        input.value = "";
    });

    const filterFrom = root.querySelector<HTMLInputElement>("#filter-from")!;
    const filterTo = root.querySelector<HTMLInputElement>("#filter-to")!;

    filterFrom.addEventListener("change", (e) => {
        const v = (e.target as HTMLInputElement).value;
        handlers.onFilter({dateFrom: v || null});
    });

    filterTo.addEventListener("change", (e) => {
        const v = (e.target as HTMLInputElement).value;
        handlers.onFilter({dateTo: v || null});
    });

    root.querySelector<HTMLSelectElement>("#filter-cat")!.addEventListener("change", (e) => {
        const v = (e.target as HTMLSelectElement).value;
        handlers.onFilter({category: v || null});
    });

    let searchTimeout: number | undefined;
    root.querySelector<HTMLInputElement>("#filter-text")!.addEventListener("input", (e) => {
        clearTimeout(searchTimeout);
        searchTimeout = window.setTimeout(() => {
            handlers.onFilter({text: (e.target as HTMLInputElement).value});
        }, 300);
    });

    root.querySelector<HTMLSelectElement>("#sort-select")!.addEventListener("change", (e) => {
        handlers.onSort((e.target as HTMLSelectElement).value as SortBy);
    });

    root.querySelector<HTMLElement>("#expense-list")!.addEventListener("click", (ev) => {
        const btn = (ev.target as HTMLElement).closest<HTMLButtonElement>("button[data-action]");
        if (!btn) return;
        const row = btn.closest<HTMLTableRowElement>("tr");
        // @ts-ignore
        const id = row.dataset["id"];
        if (!id) return;
        const action = btn.dataset["action"];
        if (action === "delete") handlers.onDelete(id);
        if (action === "edit") handlers.onEdit(id);
    });

    root.querySelector<HTMLButtonElement>("#export-btn")!.addEventListener("click", handlers.onExport);
    root.querySelector<HTMLInputElement>("#import-input")!.addEventListener("change", (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (file) handlers.onImport(file);
        (e.target as HTMLInputElement).value = "";
    });
};

/**
 * @param root Element główny.
 * @param state Aktualny stan.
 * @param visible Widoczne wydatki.
 * @remarks Granica IO; częściowa aktualizacja bez pełnego rerendera.
 */
export const updateList = (
    root: HTMLElement,
    state: State,
    visible: ReadonlyArray<Expense>
): void => {
    const summary = computeSummary(visible);

    const expenseList = root.querySelector<HTMLElement>("#expense-list");
    if (expenseList) {
        expenseList.innerHTML = renderExpenseRows(visible);
    }

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
        monthlySection.innerHTML = summary.monthly.length > 0
            ? `<h2 style="margin-top:var(--gap)">📅 Miesięcznie</h2><div class="summary-grid">${renderMonthlySummary(summary, state.currency)}</div>`
            : "";
    }
};

/**
 * @param root Element główny.
 * @param state Aktualny stan.
 * @remarks Granica IO; aktualizuje tylko listy kategorii w selectach.
 */
export const updateCategories = (root: HTMLElement, state: State): void => {
    const formCategory = root.querySelector<HTMLSelectElement>("#form-category");
    if (formCategory) {
        formCategory.innerHTML = renderCategoryOptions(state);
    }

    const filterCat = root.querySelector<HTMLSelectElement>("#filter-cat");
    if (filterCat) {
        const currentValue = filterCat.value;
        filterCat.innerHTML = renderFilterCategoryOptions(state);
        filterCat.value = currentValue;
    }
};

/**
 * @param root Element główny.
 * @param state Aktualny stan.
 * @remarks Granica IO; aktualizuje atrybuty min/max pól daty w filtrach.
 */
export const updateFilterDates = (root: HTMLElement, state: State): void => {
    const filterFrom = root.querySelector<HTMLInputElement>("#filter-from");
    const filterTo = root.querySelector<HTMLInputElement>("#filter-to");

    if (filterFrom) {
        filterFrom.value = state.filters.dateFrom ?? "";
        if (state.filters.dateTo) {
            filterFrom.setAttribute("max", state.filters.dateTo);
        } else {
            filterFrom.removeAttribute("max");
        }
    }

    if (filterTo) {
        filterTo.value = state.filters.dateTo ?? "";
        if (state.filters.dateFrom) {
            filterTo.setAttribute("min", state.filters.dateFrom);
        } else {
            filterTo.removeAttribute("min");
        }
    }
};