import { computeSummary, Currency, CURRENCIES, Expense, State } from "../core";

/**
 * @param n Kwota.
 * @param currency Kod waluty.
 * @returns Sformatowany tekst kwoty.
 * @remarks Czysta funkcja; helper prezentacji; brak IO.
 */
export const formatMoney = (n: number, currency: string): string =>
    `${n.toFixed(2)} ${currency}`;

/**
 * @param month Miesiąc w formacie YYYY-MM.
 * @returns Nazwa miesiąca (PL) + rok.
 * @remarks Czysta funkcja; helper prezentacji; brak IO.
 */
export const formatMonth = (month: string): string => {
    const [year, m] = month.split("-");
    const months = [
        "Styczeń","Luty","Marzec","Kwiecień","Maj","Czerwiec",
        "Lipiec","Sierpień","Wrzesień","Październik","Listopad","Grudzień",
    ];
    const idx = parseInt(m, 10) - 1;
    return `${months[idx] ?? m} ${year}`;
};

/**
 * @param selected Aktualnie wybrana waluta.
 * @returns HTML opcji <option> dla selecta walut.
 * @remarks Czysta funkcja; generowanie markup; brak DOM.
 */
export const renderCurrencyOptions = (selected: Currency): string =>
    CURRENCIES.map(
        (c) => `<option value="${c}"${c === selected ? " selected" : ""}>${c}</option>`
    ).join("");

/**
 * @param state Aktualny stan.
 * @returns HTML opcji <option> dla kategorii.
 * @remarks Czysta funkcja; generowanie markup; brak DOM.
 */

export const renderCategoryOptions = (state: State): string =>
    state.categories.map((c) => `<option value="${c}">${c}</option>`).join("");

/**
 * @param state Aktualny stan.
 * @returns HTML opcji filtra kategorii (z "Wszystkie kategorie").
 * @remarks Czysta funkcja; generowanie markup; brak DOM.
 */
export const renderFilterCategoryOptions = (state: State): string =>
    `<option value="">Wszystkie kategorie</option>${renderCategoryOptions(state)}`;

/**
 * @param visible Lista wydatków do wyświetlenia.
 * @returns HTML wierszy tabeli.
 * @remarks Czysta funkcja; prezentacja; brak DOM.
 */
export const renderExpenseRows = (visible: ReadonlyArray<Expense>): string =>
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
 * @param currency Waluta bazowa.
 * @returns HTML sekcji podsumowania wg kategorii.
 * @remarks Czysta funkcja; prezentacja; brak DOM.
 */
export const renderCategorySummary = (
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
 * @param currency Waluta bazowa.
 * @returns HTML sekcji podsumowania miesięcznego.
 * @remarks Czysta funkcja; prezentacja; brak DOM.
 */
export const renderMonthlySummary = (
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

const renderDialogs = (state: State): string => `
  <dialog id="confirm-dialog">
    <form method="dialog" class="dialog-form">
      <h3>Potwierdzenie</h3>
      <p id="confirm-text"></p>
      <div class="btn-row">
        <button value="cancel" class="btn-secondary">Anuluj</button>
        <button value="ok" class="btn-danger">Tak</button>
      </div>
    </form>
  </dialog>

  <dialog id="import-choice-dialog">
    <form method="dialog" class="dialog-form">
      <h3>Import danych</h3>
      <p>Co chcesz zrobić z zaimportowanymi danymi?</p>
      <div class="btn-row">
        <button value="cancel" class="btn-secondary">Anuluj</button>
        <button value="merge" class="btn-secondary">Scal</button>
        <button value="replace" class="btn-danger">Zastąp</button>
      </div>
    </form>
  </dialog>

  <dialog id="edit-dialog">
    <div class="dialog-form">
      <h3>Edycja wydatku</h3>
      <form id="edit-form">
        <div class="form-grid">
          <label>
            Kwota
            <input type="number" name="amount" step="0.01" min="0" required />
          </label>

          <label>
            Waluta
            <select name="currency" id="edit-currency">
              ${renderCurrencyOptions(state.currency)}
            </select>
          </label>

          <label>
            Kategoria
            <select name="category" id="edit-category" required>
              ${renderCategoryOptions(state)}
            </select>
          </label>

          <label>
            Data
            <input type="date" name="date" required />
          </label>

          <label class="full-width">
            Notatka (opcjonalnie)
            <textarea name="note"></textarea>
          </label>
        </div>

        <div class="btn-row">
          <button type="button" class="btn-secondary" id="edit-cancel">Anuluj</button>
          <button type="submit" class="btn-primary">Zapisz</button>
        </div>
      </form>
    </div>
  </dialog>
`;

/**
 * @param state Aktualny stan.
 * @param visible Widoczne wydatki po filtrach.
 * @returns Pełny HTML aplikacji (markup).
 * @remarks Czysta funkcja; renderowanie jako string; brak efektów DOM/IO.
 */
export const renderAppHtml = (state: State, visible: ReadonlyArray<Expense>): string => {
    const summary = computeSummary(visible, state.currency, state.fxPLN);
    const today = new Date().toISOString().slice(0, 10);

    return `
  <div id="ui-message" class="ui-message hidden" data-kind="" role="status"></div>

  <div class="header-row">
    <div>
      <h1>Tracker Wydatków</h1>
      <p class="subtitle">Offline • Dane w localStorage</p>
      <p class="subtitle">Kursy: ${state.fxLabel}</p>
    </div>

    <div class="btn-row" style="gap:10px; align-items:center;">
      <label class="btn-secondary" style="display:inline-flex;align-items:center;gap:8px; padding:10px 18px;">
        Waluta bazowa
        <select id="base-currency" style="border:0;background:transparent;outline:none;">
          ${renderCurrencyOptions(state.currency)}
        </select>
      </label>

      <button class="btn-secondary" id="refresh-fx-btn">Odśwież kursy</button>
      <button class="btn-primary" id="export-btn">Eksportuj</button>

      <label class="btn-secondary" style="cursor:pointer;display:inline-flex;align-items:center;padding:10px 18px;">
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
          <input type="number" name="amount" step="0.01" min="0" placeholder="0.00" required />
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
          <input type="date" name="date" value="${today}" required />
        </label>

        <label class="full-width">
          Notatka (opcjonalnie)
          <textarea name="note" placeholder="Na co wydano?"></textarea>
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
        <input type="date" id="filter-from" value="${state.filters.dateFrom ?? ""}" ${
        state.filters.dateTo ? `max="${state.filters.dateTo}"` : ""
    } />
      </label>
      <label>
        Do
        <input type="date" id="filter-to" value="${state.filters.dateTo ?? ""}" ${
        state.filters.dateFrom ? `min="${state.filters.dateFrom}"` : ""
    } />
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
    <h2>Podsumowanie (w ${state.currency})</h2>
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
            ? `<h2 style="margin-top:var(--gap)">Miesięcznie</h2><div class="summary-grid">${renderMonthlySummary(
                summary,
                state.currency
            )}</div>`
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

  ${renderDialogs(state)}
  `;
};
